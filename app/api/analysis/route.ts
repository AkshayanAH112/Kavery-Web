import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";

const { exams: E, marks: M, students: S, classSessions: C, attendance: A } = schema;

const groupKey = (batchId: string | null, grade: number) => `${batchId ?? ""}|${grade}`;
type ExamStatus = "sat" | "absent" | "missing";

/**
 * Marks and attendance together for a date range — the one combined ranking.
 *
 * A student is ranked by exams sat first, then by their average on the papers
 * they sat, with attendance only breaking ties: someone who sat one paper and
 * scored 95 must not outrank someone who sat all five. An absent paper and a
 * paper with no mark entered are both "not sat", but they are reported apart.
 */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const startParam = new Date(q.get("start") ?? "");
  const endParam = new Date(q.get("end") ?? "");
  if (Number.isNaN(startParam.getTime()) || Number.isNaN(endParam.getTime())) return Response.json({ error: "start and end dates are required" }, { status: 400 });
  // The form sends calendar dates; read them as Sri Lankan days.
  const start = getDayRange(startParam.getTime() + 12 * 3600000).start;
  const end = new Date(getDayRange(endParam.getTime() + 12 * 3600000).end.getTime() - 1);
  const grade = q.get("grade") ? Number(q.get("grade")) : null;
  const batchId = q.get("batchId");

  const db = getDb();
  const [exams, sessions] = await Promise.all([
    db.select().from(E).where(and(gte(E.examDate, start), lte(E.examDate, end), grade ? eq(E.grade, grade) : undefined, batchId ? eq(E.batchId, batchId) : undefined)),
    db.select().from(C).where(and(gte(C.date, start), lte(C.date, end), grade ? eq(C.grade, grade) : undefined, batchId ? eq(C.batchId, batchId) : undefined)),
  ]);

  const examById = new Map(exams.map((e) => [e.id, e]));
  const examsByGroup = new Map<string, string[]>();
  for (const e of exams) examsByGroup.set(groupKey(e.batchId, e.grade), [...(examsByGroup.get(groupKey(e.batchId, e.grade)) ?? []), e.id]);

  const marks = exams.length ? await db.select().from(M).where(inArray(M.examId, exams.map((e) => e.id))) : [];
  const average = new Map<string, { total: number; count: number }>();
  const rows = new Map<string, Map<string, { marks: number; isAbsent: boolean }>>();
  for (const m of marks) {
    const exam = examById.get(m.examId)!;
    rows.set(m.studentId, (rows.get(m.studentId) ?? new Map()).set(m.examId, { marks: m.marks, isAbsent: m.isAbsent }));
    if (m.isAbsent) continue; // stored as 0, but it is not a score
    const entry = average.get(m.studentId) ?? { total: 0, count: 0 };
    entry.total += (m.marks / exam.maxMarks) * 100;
    entry.count += 1;
    average.set(m.studentId, entry);
  }

  // Attendance: each session's register is its batch and grade, minus anyone not yet registered that day.
  const attendance = new Map<string, { attended: number; total: number }>();
  if (sessions.length > 0) {
    const [roster, records] = await Promise.all([
      db.select().from(S).where(inArray(S.batchId, [...new Set(sessions.map((s) => s.batchId))])),
      db.select({ studentId: A.studentId, classId: A.classId, present: A.present }).from(A).where(inArray(A.classId, sessions.map((s) => s.id))),
    ]);
    const present = new Set(records.filter((r) => r.present).map((r) => `${r.studentId}|${r.classId}`));
    for (const session of sessions) {
      for (const student of roster) {
        if (student.batchId !== session.batchId || student.grade !== session.grade) continue;
        if (student.registrationDate && student.registrationDate > session.date) continue;
        const entry = attendance.get(student.id) ?? { attended: 0, total: 0 };
        entry.total += 1;
        if (present.has(`${student.id}|${session.id}`)) entry.attended += 1;
        attendance.set(student.id, entry);
      }
    }
  }

  const studentIds = [...new Set([...average.keys(), ...rows.keys(), ...attendance.keys()])];
  if (studentIds.length === 0) return Response.json({ students: [], exams: [] });
  const students: (typeof S.$inferSelect)[] = [];
  for (let i = 0; i < studentIds.length; i += 90) students.push(...(await db.select().from(S).where(inArray(S.id, studentIds.slice(i, i + 90)))));

  const results = students.map((s) => {
    const m = average.get(s.id);
    const a = attendance.get(s.id);
    const avgMarksPercent = m ? Math.round(m.total / m.count) : null;
    const attendancePercent = a && a.total > 0 ? Math.round((a.attended / a.total) * 100) : null;
    const parts = [avgMarksPercent, attendancePercent].filter((v): v is number => v !== null);

    // Expected papers: every exam for the student's batch and grade held on or after they registered,
    // plus any they have a row for regardless.
    const own = rows.get(s.id);
    const expected = new Set(own?.keys());
    for (const examId of examsByGroup.get(groupKey(s.batchId, s.grade)) ?? []) {
      if (!s.registrationDate || s.registrationDate <= examById.get(examId)!.examDate) expected.add(examId);
    }
    const examsSat = m?.count ?? 0;

    return {
      studentId: s.id,
      name: s.name,
      school: s.school || null,
      grade: s.grade,
      exams: [...expected]
        .sort((x, y) => examById.get(x)!.examDate.getTime() - examById.get(y)!.examDate.getTime())
        .map((examKey) => {
          const row = own?.get(examKey);
          const maxMarks = examById.get(examKey)!.maxMarks;
          const status: ExamStatus = !row ? "missing" : row.isAbsent ? "absent" : "sat";
          return { examKey, status, marks: status === "sat" ? row!.marks : null, maxMarks };
        }),
      examCount: examsSat,
      examsSat,
      examsTotal: expected.size,
      examsMissed: expected.size - examsSat,
      avgMarksPercent,
      attendancePercent,
      combinedScore: parts.length > 0 ? Math.round(parts.reduce((x, y) => x + y, 0) / parts.length) : null,
      partial: parts.length < 2,
    };
  });

  results.sort((a, b) => b.examsSat - a.examsSat || (b.avgMarksPercent ?? -1) - (a.avgMarksPercent ?? -1) || (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1));

  const used = new Set(results.flatMap((r) => r.exams.map((e) => e.examKey)));
  return Response.json({
    students: results,
    exams: exams
      .filter((e) => used.has(e.id))
      .sort((a, b) => a.examDate.getTime() - b.examDate.getTime() || (a.name || a.subject).localeCompare(b.name || b.subject))
      .map((e) => ({ key: e.id, label: e.name || e.subject, subject: e.subject, examDate: e.examDate.toISOString(), maxMarks: e.maxMarks, grade: e.grade })),
    range: { start: start.toISOString(), end: end.toISOString() },
  });
}
