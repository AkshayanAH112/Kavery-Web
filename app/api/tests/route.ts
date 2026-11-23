import { and, desc, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { papersOf, parseNewTest, testDoc } from "@/lib/keda/exams";
import { batchMap, readBody } from "@/lib/keda/server";
import { combineTest } from "@/lib/keda/test-results";

const { tests: T, exams: E, marks: M, students: S } = schema;

/**
 * Tests, newest first. Each paper says how many of its students have a mark or an absence entered
 * (`recorded` of `rosterCount`), and each test carries the class average of its totals.
 */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const kind = q.get("kind");
  const db = getDb();
  const tests = await db
    .select()
    .from(T)
    .where(and(q.get("grade") ? eq(T.grade, Number(q.get("grade"))) : undefined, q.get("batchId") ? eq(T.batchId, q.get("batchId")!) : undefined, kind === "test" || kind === "model" ? eq(T.kind, kind) : undefined))
    .orderBy(desc(T.createdAt));
  if (tests.length === 0) return Response.json({ tests: [] });

  const papers = await papersOf(tests.map((t) => t.id));
  const [marks, batches, cohort] = await Promise.all([
    papers.length ? db.select().from(M).where(inArray(M.examId, papers.map((p) => p.id))) : [],
    batchMap(tests.map((t) => t.batchId)),
    db.select({ id: S.id, batchId: S.batchId, grade: S.grade, isActive: S.isActive, registrationDate: S.registrationDate }).from(S).where(inArray(S.batchId, [...new Set(tests.map((t) => t.batchId))])),
  ]);

  // The same roster rule as a paper's own page (paperRoster), counted rather than listed.
  const rosterCount = (paper: (typeof papers)[number]) => {
    const marked = new Set(marks.filter((m) => m.examId === paper.id).map((m) => m.studentId));
    const eligible = cohort.filter((s) => s.batchId === paper.batchId && s.grade === paper.grade && (marked.has(s.id) || (s.isActive && (!s.registrationDate || s.registrationDate <= paper.examDate))));
    const others = [...marked].filter((id) => !eligible.some((s) => s.id === id)).length;
    return { recorded: marked.size, rosterCount: eligible.length + others };
  };

  const docs = tests.map((t) => {
    const own = papers.filter((p) => p.testId === t.id);
    const doc = testDoc(t, own, batches.get(t.batchId));
    const { classAverage, ranked } = combineTest(own, marks);
    const counts = new Map(own.map((p) => [p.id, rosterCount(p)]));
    return { ...doc, papers: doc.papers.map((p) => ({ ...p, ...counts.get(p._id)! })), classAverage, ranked };
  });
  docs.sort((a, b) => b.date.localeCompare(a.date));
  return Response.json({ tests: docs });
}

/** Creates a test and its papers together. A new test always starts unpublished. */
export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const input = await parseNewTest(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  const testId = crypto.randomUUID();
  await db.batch([
    db.insert(T).values({ id: testId, name: input.name, kind: input.kind, grade: input.grade, batchId: input.batchId, isPublished: false }),
    ...input.papers.map((p) => db.insert(E).values({ testId, part: p.part, subject: p.subject, grade: input.grade, batchId: input.batchId, examDate: p.examDate, maxMarks: p.maxMarks })),
  ]);
  const [test] = await db.select().from(T).where(eq(T.id, testId));
  return Response.json({ test: testDoc(test, await papersOf([testId])) }, { status: 201 });
}
