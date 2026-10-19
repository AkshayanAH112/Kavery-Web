import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBatch, type StudentRow } from "@/lib/keda/server";
import { papersOf, type TestRow } from "./exams";
import { byPart, combineTest, round1 } from "./test-results";

const { tests: T, marks: M } = schema;

/**
 * One student's published results — what a parent sees. One result per TEST: Part 1, Part 2 and
 * their total, the class average and the rank, all from `combineTest` (lib/keda/test-results.ts).
 * The choices here are load-bearing:
 *  - Only tests an administrator has PUBLISHED are visible at all, and a test is published whole.
 *  - The result is assembled field by field, never spread from the student row,
 *    so a guardian's phone or an address cannot leak when a column is added.
 *  - An absent part is `null`, not the 0 it is stored as — a 0 would read to a
 *    parent as a score of nought.
 *  - Model exams are summarised apart from the regular tests: a full mock says
 *    something different from a week's class test, and mixing them blurs both.
 */
export async function studentResults(student: StudentRow) {
  const db = getDb();
  const studentSummary = { name: student.name, grade: student.grade, registrationNumber: student.registrationNumber ?? "", batchName: (await getBatch(student.batchId))?.name ?? null };

  const ownMarks = await db.select().from(M).where(eq(M.studentId, student.id));
  const ownPapers = ownMarks.length ? await db.query.exams.findMany({ where: (e, { inArray }) => inArray(e.id, ownMarks.map((m) => m.examId)) }) : [];
  const testIds = [...new Set(ownPapers.map((p) => p.testId).filter((id): id is string => Boolean(id)))];
  const published: TestRow[] = testIds.length ? await db.select().from(T).where(and(inArray(T.id, testIds), eq(T.isPublished, true))) : [];
  if (published.length === 0) return { student: studentSummary, results: [], summary: null, modelSummary: null, published };

  const papers = await papersOf(published.map((t) => t.id));
  const cohort = await db.select().from(M).where(inArray(M.examId, papers.map((p) => p.id)));

  // Every student's percentage on every published test, for the overall placings below.
  const percents = new Map<string, Map<string, number>>();
  const results = published.map((test) => {
    const own = byPart(papers.filter((p) => p.testId === test.id));
    const { standings, ranked, classAverage, maxTotal } = combineTest(own, cohort);
    for (const s of standings.values()) if (s.percent !== null) percents.set(test.id, (percents.get(test.id) ?? new Map()).set(s.studentId, s.percent));
    const mine = standings.get(student.id)!;
    return {
      testId: test.id,
      name: test.name,
      kind: test.kind as "test" | "model",
      date: new Date(Math.min(...own.map((p) => p.examDate.getTime()))).toISOString(),
      parts: own.map((p, i) => ({ part: p.part, subject: p.subject, examDate: p.examDate.toISOString(), maxMarks: p.maxMarks, status: mine.parts[i].status, marks: mine.parts[i].marks })),
      total: mine.total,
      maxTotal,
      percent: mine.percent === null ? null : round1(mine.percent),
      isAbsent: mine.absent,
      classAverage,
      rank: mine.rank,
      outOf: ranked,
    };
  });
  results.sort((a, b) => b.date.localeCompare(a.date));

  /** Average percentage over the given tests, and the placing on it among everyone who has one. */
  const placing = (kind: "test" | "model") => {
    const ids = results.filter((r) => r.kind === kind).map((r) => r.testId);
    if (ids.length === 0) return null;
    const averages = new Map<string, { total: number; count: number }>();
    for (const id of ids) {
      for (const [studentId, percent] of percents.get(id) ?? []) {
        const entry = averages.get(studentId) ?? { total: 0, count: 0 };
        entry.total += percent;
        entry.count += 1;
        averages.set(studentId, entry);
      }
    }
    const all = [...averages.values()].map((e) => e.total / e.count);
    const own = averages.get(student.id);
    const ownAverage = own ? own.total / own.count : null;
    return {
      testsPublished: ids.length,
      testsCounted: own?.count ?? 0,
      averagePercent: ownAverage === null ? null : round1(ownAverage),
      rank: ownAverage === null ? null : all.filter((a) => a > ownAverage).length + 1,
      outOf: all.length,
    };
  };

  // Strongest and weakest paper: Part 1 against Part 2 (and any single-paper subject), over the parts sat.
  const byPaper = new Map<string, { part: number | null; subject: string; total: number; count: number }>();
  for (const r of results) {
    for (const p of r.parts) {
      if (p.status !== "sat") continue;
      const key = p.part ? `part-${p.part}` : p.subject;
      const entry = byPaper.get(key) ?? { part: p.part, subject: p.subject, total: 0, count: 0 };
      entry.total += (p.marks! / p.maxMarks) * 100;
      entry.count += 1;
      byPaper.set(key, entry);
    }
  }
  const subjects = [...byPaper.values()].map((e) => ({ part: e.part, subject: e.subject, averagePercent: round1(e.total / e.count), testsCounted: e.count })).sort((a, b) => b.averagePercent - a.averagePercent);

  const tests = placing("test");
  return {
    student: studentSummary,
    results,
    summary: tests ? { ...tests, subjects } : null,
    modelSummary: placing("model"),
    published,
  };
}
