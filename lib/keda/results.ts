import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBatch, type StudentRow } from "@/lib/keda/server";

const { exams: E, marks: M } = schema;

/**
 * One student's published marks, rank per paper, class average and overall
 * placing — what a parent sees. The choices here are load-bearing:
 *  - Only exams an administrator has PUBLISHED are visible at all.
 *  - The result is assembled field by field, never spread from the student row,
 *    so a guardian's phone or an address cannot leak when a column is added.
 *  - An absent paper is `null`, not the 0 it is stored as — a 0 would read to a
 *    parent as a score of nought — and is left out of averages and ranks.
 *  - Ranks are standard competition ranks (1, 2, 2, 4) among those who sat the paper.
 */
const round1 = (n: number) => Math.round(n * 10) / 10;
const rankOf = (scores: number[], score: number) => scores.filter((s) => s > score).length + 1;

export async function studentResults(student: StudentRow) {
  const db = getDb();
  const studentSummary = { name: student.name, grade: student.grade, registrationNumber: student.registrationNumber ?? "", batchName: (await getBatch(student.batchId))?.name ?? null };

  const ownMarks = await db.select().from(M).where(eq(M.studentId, student.id));
  const published = ownMarks.length
    ? await db.select().from(E).where(and(inArray(E.id, ownMarks.map((m) => m.examId)), eq(E.isPublished, true))).orderBy(desc(E.examDate))
    : [];
  if (published.length === 0) return { student: studentSummary, results: [], summary: null, published };

  const examById = new Map(published.map((e) => [e.id, e]));
  const cohort = await db.select().from(M).where(inArray(M.examId, published.map((e) => e.id)));
  const percentOf = (m: (typeof cohort)[number]) => (m.marks / examById.get(m.examId)!.maxMarks) * 100;

  const results = published.map((exam) => {
    const mine = ownMarks.find((m) => m.examId === exam.id)!;
    const percents = cohort.filter((m) => m.examId === exam.id && !m.isAbsent).map(percentOf);
    const myPercent = mine.isAbsent ? null : percentOf(mine);
    return {
      examId: exam.id,
      name: exam.name ?? null,
      subject: exam.subject,
      examDate: exam.examDate.toISOString(),
      maxMarks: exam.maxMarks,
      isAbsent: mine.isAbsent,
      marks: mine.isAbsent ? null : mine.marks,
      percent: myPercent === null ? null : round1(myPercent),
      classAverage: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
      rank: myPercent === null ? null : rankOf(percents, myPercent),
      outOf: percents.length,
    };
  });

  // Overall placing: each student's average over the published papers they actually sat.
  const totals = new Map<string, { total: number; count: number }>();
  for (const mark of cohort) {
    if (mark.isAbsent) continue;
    const entry = totals.get(mark.studentId) ?? { total: 0, count: 0 };
    entry.total += percentOf(mark);
    entry.count += 1;
    totals.set(mark.studentId, entry);
  }
  const averages = [...totals.values()].map((e) => e.total / e.count);
  const own = totals.get(student.id);
  const ownAverage = own ? own.total / own.count : null;

  const bySubject = new Map<string, { total: number; count: number }>();
  for (const result of results) {
    if (result.percent === null) continue;
    const entry = bySubject.get(result.subject) ?? { total: 0, count: 0 };
    entry.total += result.percent;
    entry.count += 1;
    bySubject.set(result.subject, entry);
  }

  return {
    student: studentSummary,
    results,
    summary: {
      examsPublished: results.length,
      examsCounted: own?.count ?? 0,
      averagePercent: ownAverage === null ? null : round1(ownAverage),
      rank: ownAverage === null ? null : rankOf(averages, ownAverage),
      outOf: averages.length,
      subjects: [...bySubject.entries()].map(([subject, e]) => ({ subject, averagePercent: round1(e.total / e.count), examsCounted: e.count })).sort((a, b) => b.averagePercent - a.averagePercent),
    },
    published,
  };
}
