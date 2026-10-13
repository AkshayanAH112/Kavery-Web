import { inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getExam } from "@/lib/keda/exams";
import { isId } from "@/lib/keda/server";

const { marks: M, students: S } = schema;

/**
 * Adds or corrects marks for an exam — one entry or a list. Saving the same
 * student again replaces their mark (one row per exam and student).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/exams/[id]/marks">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const exam = await getExam((await params).id);
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const entries = (Array.isArray(body) ? body : [body]) as { studentId?: unknown; marks?: unknown; isAbsent?: unknown }[];
  const fail = (error: string) => Response.json({ error }, { status: 400 });
  if (entries.length === 0 || entries.length > 500 || entries.some((e) => !e || typeof e !== "object")) return fail("Send one mark or a list of marks");

  const rows: { examId: string; studentId: string; marks: number; isAbsent: boolean }[] = [];
  for (const entry of entries) {
    if (!isId(entry.studentId)) return fail("Every mark needs a student");
    const isAbsent = Boolean(entry.isAbsent);
    const marks = isAbsent ? 0 : Number(entry.marks);
    // Empty, negative, or above the paper's maximum is a typing slip — refuse it rather than store it.
    if (!isAbsent && (entry.marks === "" || entry.marks === null || entry.marks === undefined || !Number.isFinite(marks) || marks < 0 || marks > exam.maxMarks)) {
      return fail(`Marks must be between 0 and ${exam.maxMarks}`);
    }
    rows.push({ examId: exam.id, studentId: entry.studentId, marks, isAbsent });
  }

  const db = getDb();
  const ids = [...new Set(rows.map((r) => r.studentId))];
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) (await db.select({ id: S.id }).from(S).where(inArray(S.id, ids.slice(i, i + 90)))).forEach((s) => known.add(s.id));
  if (ids.some((id) => !known.has(id))) return fail("One of those students does not exist");

  // All or nothing: a class's marks are never half-saved.
  const writes = rows.map((row) => db.insert(M).values(row).onConflictDoUpdate({ target: [M.examId, M.studentId], set: { marks: row.marks, isAbsent: row.isAbsent } }));
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return Response.json({ success: true, count: rows.length }, { status: 201 });
}
