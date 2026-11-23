import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { examDoc, getExam, getTest, markDoc, paperRoster, papersOf, type ExamRow } from "@/lib/keda/exams";
import { getBatch, studentDoc, type StudentRow } from "@/lib/keda/server";
import { byPart, paperLabel } from "@/lib/keda/test-results";

const { classSessions: C, attendance: A } = schema;
const NOT_FOUND = () => Response.json({ error: "Exam not found" }, { status: 404 });

/**
 * Who missed class on the paper's own day — offered to staff as a pre-ticked
 * "absent" box, and nothing more. Three rules keep it honest:
 *  - only an explicitly MARKED absence counts. "Not marked" never suggests
 *    absent, or a day the register was not closed would pre-tick the whole class;
 *  - it is a hint, not a record: this writes nothing;
 *  - a student who already has a mark is never suggested (the caller checks).
 * Each part has its own date, so a Part 2 sat on another day gets that day's register.
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

/**
 * One paper's mark-entry roster. The test it belongs to comes with it (name, kind, its other parts),
 * so the screen can say "Part 1 of Term test 3". Editing, publishing and deleting are the test's.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/exams/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const exam = await getExam((await params).id);
  if (!exam) return NOT_FOUND();

  const [batch, test, { students, marks }] = await Promise.all([getBatch(exam.batchId), getTest(exam.testId), paperRoster(exam)]);
  const siblings = test ? byPart(await papersOf([test.id])) : [exam];
  const markByStudent = new Map(marks.map((m) => [m.studentId, m]));
  const hints = await absenceHints(exam, students);

  return Response.json({
    exam: examDoc(exam, batch, test),
    test: test ? { _id: test.id, name: test.name, kind: test.kind, isPublished: test.isPublished } : null,
    parts: siblings.map((p) => ({ _id: p.id, part: p.part, label: paperLabel(p) })),
    roster: students.map((student) => {
      const mark = markByStudent.get(student.id);
      return { student: studentDoc(student), mark: mark ? markDoc(mark, exam, test) : null, isRecorded: Boolean(mark), suggestedAbsent: !mark && hints.absent.has(student.id) };
    }),
    attendance: hints.summary,
  });
}
