import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getExam, markDoc } from "@/lib/keda/exams";
import { isId, readBody } from "@/lib/keda/server";

const M = schema.marks;
const NOT_FOUND = () => Response.json({ error: "Mark not found for this exam" }, { status: 404 });

export async function PATCH(request: Request, { params }: RouteContext<"/api/exams/[id]/marks/[markId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const { id, markId } = await params;
  const exam = await getExam(id);
  if (!exam || !isId(markId)) return NOT_FOUND();

  const data = await readBody(request);
  const update: { marks?: number; isAbsent?: boolean } = {};
  if (data?.isAbsent !== undefined) {
    update.isAbsent = Boolean(data.isAbsent);
    update.marks = update.isAbsent ? 0 : Number(data.marks ?? 0);
  } else if (data?.marks !== undefined) {
    update.marks = Number(data.marks);
  }
  if (update.marks !== undefined && (!Number.isFinite(update.marks) || update.marks < 0 || update.marks > exam.maxMarks)) {
    return Response.json({ error: `Marks must be between 0 and ${exam.maxMarks}` }, { status: 400 });
  }
  if (Object.keys(update).length === 0) return Response.json({ error: "Nothing to change" }, { status: 400 });

  const [mark] = await getDb().update(M).set(update).where(and(eq(M.id, markId), eq(M.examId, exam.id))).returning();
  if (!mark) return NOT_FOUND();
  return Response.json({ mark: markDoc(mark, exam) });
}

/** Removes a mark entirely — the student goes back to "not entered", which is not the same as absent. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/exams/[id]/marks/[markId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const { id, markId } = await params;
  const exam = await getExam(id);
  if (!exam || !isId(markId)) return NOT_FOUND();
  const deleted = await getDb().delete(M).where(and(eq(M.id, markId), eq(M.examId, exam.id))).returning({ id: M.id });
  if (deleted.length === 0) return NOT_FOUND();
  return Response.json({ success: true });
}
