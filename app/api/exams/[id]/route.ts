import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { examDoc, getExam, markDoc, parseExam, type ExamRow } from "@/lib/keda/exams";
import { getBatch, readBody, sortByIndexNumber, studentDoc, type StudentRow } from "@/lib/keda/server";
import { pushInBackground } from "@/lib/push";

const { exams: E, marks: M, students: S, classSessions: C, attendance: A } = schema;
const NOT_FOUND = () => Response.json({ error: "Exam not found" }, { status: 404 });

/**
 * Who missed class on the exam's own day — offered to staff as a pre-ticked
 * "absent" box, and nothing more. Three rules keep it honest:
 *  - only an explicitly MARKED absence counts. "Not marked" never suggests
 *    absent, or a day the register was not closed would pre-tick the whole class;
 *  - it is a hint, not a record: this writes nothing;
 *  - a student who already has a mark is never suggested (the caller checks).
 */
async function absenceHints(exam: ExamRow, students: StudentRow[]) {
  const db = getDb();
  const { start, end } = getDayRange(exam.examDate);
  const sessions = await db.select({ id: C.id }).from(C).where(and(eq(C.batchId, exam.batchId), eq(C.grade, exam.grade), gte(C.date, start), lt(C.date, end)));
  const absent = new Set<string>();
  if (sessions.length > 0) {
    const records = await db.select().from(A).where(inArray(A.classId, sessions.map((s) => s.id)));
    for (const student of students) {
      const own = records.filter((r) => r.studentId === student.id);
      if (own.some((r) => r.countedAsLeave) && !own.some((r) => r.present)) absent.add(student.id);
    }
  }
  return { absent, summary: { sessionCount: sessions.length, date: exam.examDate.toISOString(), suggestedAbsentCount: absent.size } };
}

export async function GET(_request: Request, { params }: RouteContext<"/api/exams/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const exam = await getExam((await params).id);
  if (!exam) return NOT_FOUND();

  const db = getDb();
  const [batch, marks, cohort] = await Promise.all([getBatch(exam.batchId), db.select().from(M).where(eq(M.examId, exam.id)), db.select().from(S).where(and(eq(S.batchId, exam.batchId), eq(S.grade, exam.grade)))]);
  const markByStudent = new Map(marks.map((m) => [m.studentId, m]));

  // Active and registered by the exam date — plus anyone who already has a mark, so a score
  // recorded before a student was deactivated or moved never becomes uneditable.
  const missing = marks.filter((m) => !cohort.some((s) => s.id === m.studentId)).map((m) => m.studentId);
  const extra = missing.length ? await db.select().from(S).where(inArray(S.id, missing)) : [];
  const students = [...cohort.filter((s) => markByStudent.has(s.id) || (s.isActive && (!s.registrationDate || s.registrationDate <= exam.examDate))), ...extra];

  const hints = await absenceHints(exam, students);
  return Response.json({
    exam: examDoc(exam, batch),
    roster: sortByIndexNumber(students).map((student) => {
      const mark = markByStudent.get(student.id);
      return { student: studentDoc(student), mark: mark ? markDoc(mark, exam) : null, isRecorded: Boolean(mark), suggestedAbsent: !mark && hints.absent.has(student.id) };
    }),
    attendance: hints.summary,
  });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/exams/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const exam = await getExam((await params).id);
  if (!exam) return NOT_FOUND();

  const input = await parseExam(await readBody(request), true);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  // Lowering the maximum below a mark already entered would leave a score above 100%.
  if (input.maxMarks !== undefined && input.maxMarks < exam.maxMarks) {
    const marks = await db.select({ marks: M.marks }).from(M).where(and(eq(M.examId, exam.id), eq(M.isAbsent, false)));
    const highest = Math.max(0, ...marks.map((m) => m.marks));
    if (highest > input.maxMarks) return Response.json({ error: `A mark of ${highest} is already entered, so the maximum cannot be lower than that.` }, { status: 409 });
  }

  const [updated] = Object.keys(input).length ? await db.update(E).set(input).where(eq(E.id, exam.id)).returning() : [exam];
  // Parents who asked for KEDA notices are told when results go public. It names the paper, never a child.
  if (input.isPublished === true && !exam.isPublished) {
    pushInBackground("keda", { title: `Results published: ${updated.subject}${updated.name ? ` — ${updated.name}` : ""}`, body: "Open the parent page to see your child's marks.", url: "/{locale}/parents", tag: `exam-${updated.id}` });
  }
  return Response.json({ exam: examDoc(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/exams/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const exam = await getExam((await params).id);
  if (!exam) return NOT_FOUND();
  const db = getDb();
  await db.batch([db.delete(M).where(eq(M.examId, exam.id)), db.delete(E).where(eq(E.id, exam.id))]);
  return Response.json({ success: true });
}
