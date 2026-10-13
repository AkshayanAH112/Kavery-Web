import { and, desc, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { markDoc } from "@/lib/keda/exams";
import { batchMap } from "@/lib/keda/server";

const { marks: M, exams: E, students: S } = schema;

/** Every mark, newest exam first, with the student's name and the batch's name filled in. */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const db = getDb();
  const rows = await db
    .select({ mark: M, exam: E })
    .from(M)
    .innerJoin(E, eq(M.examId, E.id))
    .where(and(q.get("grade") ? eq(E.grade, Number(q.get("grade"))) : undefined, q.get("batchId") ? eq(E.batchId, q.get("batchId")!) : undefined))
    .orderBy(desc(E.examDate));
  if (rows.length === 0) return Response.json({ marks: [] });

  const studentIds = [...new Set(rows.map((r) => r.mark.studentId))];
  const students = new Map<string, { _id: string; name: string; qrCode: string }>();
  for (let i = 0; i < studentIds.length; i += 90) {
    for (const s of await db.select({ id: S.id, name: S.name, qrCode: S.qrCode }).from(S).where(inArray(S.id, studentIds.slice(i, i + 90)))) students.set(s.id, { _id: s.id, name: s.name, qrCode: s.qrCode });
  }
  const batches = await batchMap(rows.map((r) => r.exam.batchId));

  return Response.json({
    marks: rows.map(({ mark, exam }) => {
      const batch = batches.get(exam.batchId);
      return { ...markDoc(mark, exam), studentId: students.get(mark.studentId) ?? mark.studentId, batchId: batch ? { _id: batch.id, name: batch.name } : exam.batchId };
    }),
  });
}
