import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { papersOf } from "@/lib/keda/exams";
import { combineTest, type Standing } from "@/lib/keda/test-results";

const { tests: T, exams: E, marks: M, students: S, classSessions: C, attendance: A } = schema;

const groupKey = (batchId: string | null, grade: number) => `${batchId ?? ""}|${grade}`;
type ExamStatus = "sat" | "absent" | "missing";

/**
 * Marks and attendance together for a date range — the one combined ranking.
 *
 * Each TEST is one column: its total (Part 1 + Part 2), worked out by `combineTest`
 * exactly as the parent page does. A test is in the range when any of its parts
 * is. A student is ranked by tests sat first, then by their average percentage on
 * the tests they sat, with attendance only breaking ties: someone who sat one test
 * and scored 95% must not outrank someone who sat all five. Absent for a whole
 * test and nothing entered are both "not sat", but they are reported apart.
 * `kind` narrows it to regular tests or model exams.
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
  const kind = q.get("kind");

  const db = getDb();
  const [inRange, sessions] = await Promise.all([
    db.select({ testId: E.testId }).from(E).where(and(gte(E.examDate, start), lte(E.examDate, end), grade ? eq(E.grade, grade) : undefined, batchId ? eq(E.batchId, batchId) : undefined)),
    db.select().from(C).where(and(gte(C.date, start), lte(C.date, end), grade ? eq(C.grade, grade) : undefined, batchId ? eq(C.batchId, batchId) : undefined)),
  ]);
  const testIds = [...new Set(inRange.map((e) => e.testId).filter((id): id is string => Boolean(id)))];
  const tests = testIds.length ? await db.select().from(T).where(and(inArray(T.id, testIds), kind === "test" || kind === "model" ? eq(T.kind, kind) : undefined)) : [];
  const papers = await papersOf(tests.map((t) => t.id));
  const marks = papers.length ? await db.select().from(M).where(inArray(M.examId, papers.map((p) => p.id))) : [];

  // A test is dated by its first part, and belongs to its batch and grade.
  const testDate = new Map(tests.map((t) => [t.id, new Date(Math.min(...papers.filter((p) => p.testId === t.id).map((p) => p.examDate.getTime())))]));
  const testsByGroup = new Map<string, string[]>();
  for (const t of tests) testsByGroup.set(groupKey(t.batchId, t.grade), [...(testsByGroup.get(groupKey(t.batchId, t.grade)) ?? []), t.id]);

  const standings = new Map<string, Map<string, Standing>>(); // student -> test -> standing
  const maxTotal = new Map<string, number>();
  const average = new Map<string, { total: number; count: number }>();
  for (const t of tests) {
    const combined = combineTest(papers.filter((p) => p.testId === t.id), marks);
    maxTotal.set(t.id, combined.maxTotal);
    for (const s of combined.standings.values()) {
      standings.set(s.studentId, (standings.get(s.studentId) ?? new Map()).set(t.id, s));
      if (s.percent === null) continue; // absent for every part: not a score
      const entry = average.get(s.studentId) ?? { total: 0, count: 0 };
      entry.total += s.percent;
      entry.count += 1;
      average.set(s.studentId, entry);
    }
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

  const studentIds = [...new Set([...average.keys(), ...standings.keys(), ...attendance.keys()])];
  if (studentIds.length === 0) return Response.json({ students: [], exams: [] });
  const students: (typeof S.$inferSelect)[] = [];
  for (let i = 0; i < studentIds.length; i += 90) students.push(...(await db.select().from(S).where(inArray(S.id, studentIds.slice(i, i + 90)))));

  const results = students.map((s) => {
    const m = average.get(s.id);
    const a = attendance.get(s.id);
    const avgMarksPercent = m ? Math.round(m.total / m.count) : null;
    const attendancePercent = a && a.total > 0 ? Math.round((a.attended / a.total) * 100) : null;
    const parts = [avgMarksPercent, attendancePercent].filter((v): v is number => v !== null);

    // Expected tests: every test for the student's batch and grade held on or after they registered,
    // plus any they have a mark on regardless.
    const own = standings.get(s.id);
    const expected = new Set(own?.keys());
    for (const testId of testsByGroup.get(groupKey(s.batchId, s.grade)) ?? []) {
      if (!s.registrationDate || s.registrationDate <= testDate.get(testId)!) expected.add(testId);
    }
    const examsSat = m?.count ?? 0;

    return {
      studentId: s.id,
      name: s.name,
      school: s.school || null,
      grade: s.grade,
      exams: [...expected]
        .sort((x, y) => testDate.get(x)!.getTime() - testDate.get(y)!.getTime())
        .map((examKey) => {
          const standing = own?.get(examKey);
          const maxMarks = maxTotal.get(examKey)!;
          const status: ExamStatus = !standing || (standing.total === null && !standing.complete) ? "missing" : standing.total === null ? "absent" : "sat";
          const note = status !== "sat" ? null : standing!.parts.some((p) => p.status === "absent") ? "absent" : standing!.parts.some((p) => p.status === "missing") ? "missing" : null;
          return { examKey, status, marks: status === "sat" ? standing!.total : null, maxMarks, note };
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
    exams: tests
      .filter((t) => used.has(t.id))
      .sort((a, b) => testDate.get(a.id)!.getTime() - testDate.get(b.id)!.getTime() || a.name.localeCompare(b.name))
      .map((t) => ({ key: t.id, label: t.name, kind: t.kind, examDate: testDate.get(t.id)!.toISOString(), maxMarks: maxTotal.get(t.id)!, grade: t.grade })),
    range: { start: start.toISOString(), end: end.toISOString() },
  });
}
