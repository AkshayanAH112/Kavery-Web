/**
 * How a test's papers become one result — the only place this is decided. The console's test page,
 * the result sheet, the parent page and the analysis all call `combineTest`, so a parent and a member
 * of staff can never see two different totals or ranks for one test.
 *
 * The rules (KEDA's, for the scholarship classes):
 *  - The total is the sum of the parts the student sat, out of the sum of every part's maximum
 *    (Part 1 + Part 2, usually 100 + 100).
 *  - A part the student was absent for adds nothing to the total and is shown as "absent", never as
 *    the 0 it is stored as. The student is still ranked on the total of what they sat.
 *  - Absent for every part: no total and no rank.
 *  - A part with no mark entered yet ("missing") is a third state, not absence. A published test has
 *    none (publishing checks), but while marks are being typed in a total can be partial.
 *  - Ranks are standard competition ranks (1, 2, 2, 4) among the students with a total.
 *
 * Pure: no database, so the browser can use it too.
 */

export type Paper = { id: string; part: number | null; maxMarks: number };
export type PaperMark = { examId: string; studentId: string; marks: number; isAbsent: boolean };

export type PartResult = { examId: string; part: number | null; maxMarks: number } & ({ status: "sat"; marks: number } | { status: "absent" | "missing"; marks: null });

export type Standing = {
  studentId: string;
  /** In paper order (Part 1, then Part 2). */
  parts: PartResult[];
  /** Sum of the parts sat; null when none was. */
  total: number | null;
  maxTotal: number;
  percent: number | null;
  rank: number | null;
  /** Every part has a mark or an absence recorded. */
  complete: boolean;
  /** Absent for every part. */
  absent: boolean;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Papers in the order they are shown: Part 1, Part 2 (a single paper has no part). */
export const byPart = <T extends { part: number | null }>(papers: T[]) => [...papers].sort((a, b) => (a.part ?? 0) - (b.part ?? 0));

/**
 * Standings for one test. `studentIds` adds students with no mark yet (a roster), so they appear as
 * "missing" on every part; anyone with a mark on any part is included regardless.
 */
export function combineTest(papers: Paper[], marks: PaperMark[], studentIds: Iterable<string> = []) {
  const ordered = byPart(papers);
  const paperIds = new Set(ordered.map((p) => p.id));
  const maxTotal = ordered.reduce((sum, p) => sum + p.maxMarks, 0);

  const markOf = new Map<string, PaperMark>();
  const students = new Set(studentIds);
  for (const m of marks) {
    if (!paperIds.has(m.examId)) continue;
    markOf.set(`${m.studentId}|${m.examId}`, m);
    students.add(m.studentId);
  }

  const standings = new Map<string, Standing>();
  for (const studentId of students) {
    const parts: PartResult[] = ordered.map((p) => {
      const m = markOf.get(`${studentId}|${p.id}`);
      const base = { examId: p.id, part: p.part, maxMarks: p.maxMarks };
      if (!m) return { ...base, status: "missing", marks: null };
      if (m.isAbsent) return { ...base, status: "absent", marks: null };
      return { ...base, status: "sat", marks: m.marks };
    });
    const sat = parts.filter((p) => p.status === "sat");
    const total = sat.length ? sat.reduce((sum, p) => sum + (p.marks ?? 0), 0) : null;
    standings.set(studentId, {
      studentId,
      parts,
      total,
      maxTotal,
      percent: total === null || maxTotal === 0 ? null : (total / maxTotal) * 100,
      rank: null,
      complete: parts.every((p) => p.status !== "missing"),
      absent: parts.every((p) => p.status === "absent"),
    });
  }

  const ranked = [...standings.values()].filter((s) => s.total !== null).sort((a, b) => b.total! - a.total!);
  ranked.forEach((s, i) => {
    s.rank = i > 0 && ranked[i - 1].total === s.total ? ranked[i - 1].rank : i + 1;
  });
  const classAverage = ranked.length ? round1(ranked.reduce((sum, s) => sum + s.percent!, 0) / ranked.length) : null;

  return { standings, ranked: ranked.length, classAverage, maxTotal };
}

/** The label a paper goes by: "Part 1" / "Part 2", or a single paper's subject. */
export const paperLabel = (paper: { part: number | null; subject: string }) => (paper.part ? `Part ${paper.part}` : paper.subject);
