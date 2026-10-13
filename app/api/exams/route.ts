import { and, desc, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { examDoc, parseExam } from "@/lib/keda/exams";
import { batchMap, readBody } from "@/lib/keda/server";

const { exams: E, marks: M } = schema;

/** Exams, newest first, each with how many results are in and the average of those who sat it. */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const db = getDb();
  const exams = await db
    .select()
    .from(E)
    .where(and(q.get("grade") ? eq(E.grade, Number(q.get("grade"))) : undefined, q.get("batchId") ? eq(E.batchId, q.get("batchId")!) : undefined, q.get("subject") ? eq(E.subject, q.get("subject")!) : undefined))
    .orderBy(desc(E.examDate));
  if (exams.length === 0) return Response.json({ exams: [] });

  const [marks, batches] = await Promise.all([db.select().from(M).where(inArray(M.examId, exams.map((e) => e.id))), batchMap(exams.map((e) => e.batchId))]);
  const stats = new Map<string, { count: number; scored: number; sat: number }>();
  for (const m of marks) {
    const entry = stats.get(m.examId) ?? { count: 0, scored: 0, sat: 0 };
    entry.count += 1;
    // An absent paper is a row, so it counts as "entered", but it is not a score.
    if (!m.isAbsent) {
      entry.scored += m.marks;
      entry.sat += 1;
    }
    stats.set(m.examId, entry);
  }

  return Response.json({
    exams: exams.map((e) => {
      const s = stats.get(e.id);
      return { ...examDoc(e, batches.get(e.batchId)), resultsCount: s?.count ?? 0, averagePercent: s && s.sat > 0 ? Math.round((s.scored / (s.sat * e.maxMarks)) * 100) : null };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const input = await parseExam(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });
  // A new exam always starts unpublished, whatever the body says.
  const [exam] = await getDb()
    .insert(E)
    .values({ subject: input.subject!, name: input.name ?? null, grade: input.grade!, batchId: input.batchId!, examDate: input.examDate!, maxMarks: input.maxMarks!, isPublished: false })
    .returning();
  return Response.json({ exam: examDoc(exam) }, { status: 201 });
}
