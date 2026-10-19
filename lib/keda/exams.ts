import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBatch, isGrade, isId, parseDate, sortByIndexNumber, text, type BatchRow, type StudentRow } from "./server";
import { byPart, paperLabel } from "./test-results";

const { exams: E, tests: T, marks: M, students: S } = schema;

export type TestRow = typeof T.$inferSelect;
export type ExamRow = typeof E.$inferSelect;
export type MarkRow = typeof M.$inferSelect;
export type TestKind = "test" | "model";

/** One paper, in the shape the screens read. The test's name and publish state come down with it. */
export const examDoc = (e: ExamRow, batch?: BatchRow | null, test?: TestRow | null) => ({
  _id: e.id,
  testId: e.testId,
  part: e.part,
  subject: e.subject,
  label: paperLabel(e),
  name: test?.name,
  kind: test?.kind,
  grade: e.grade,
  batchId: batch ? { _id: batch.id, name: batch.name } : e.batchId,
  examDate: e.examDate.toISOString(),
  maxMarks: e.maxMarks,
  isPublished: test?.isPublished ?? false,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

export const testDoc = (t: TestRow, papers: ExamRow[], batch?: BatchRow | null) => {
  const ordered = byPart(papers);
  return {
    _id: t.id,
    name: t.name,
    kind: t.kind as TestKind,
    grade: t.grade,
    batchId: batch ? { _id: batch.id, name: batch.name } : t.batchId,
    isPublished: t.isPublished,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    /** The first paper's day: what the test is listed and filtered by. */
    date: ordered.length ? new Date(Math.min(...ordered.map((p) => p.examDate.getTime()))).toISOString() : t.createdAt.toISOString(),
    maxTotal: ordered.reduce((sum, p) => sum + p.maxMarks, 0),
    papers: ordered.map((p) => examDoc(p, batch, t)),
    createdAt: t.createdAt.toISOString(),
  };
};

/**
 * A mark in the flat shape the screens read: subject, date, maximum, grade and
 * batch are copied down from the paper, the name from its test. `marks` is stored
 * as 0 for an absent student — `isAbsent` is the signal, never the zero.
 */
export const markDoc = (m: MarkRow, exam: ExamRow, test?: TestRow | null) => ({
  _id: m.id,
  studentId: m.studentId,
  examId: exam.id,
  testId: exam.testId,
  part: exam.part,
  subject: exam.subject,
  examName: test?.name,
  examDate: exam.examDate.toISOString(),
  marks: m.marks,
  isAbsent: m.isAbsent,
  maxMarks: exam.maxMarks,
  grade: exam.grade,
  batchId: exam.batchId,
});

export async function getExam(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.exams.findFirst({ where: eq(E.id, id) })) ?? null;
}

export async function getTest(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.tests.findFirst({ where: eq(T.id, id) })) ?? null;
}

export async function papersOf(testIds: string[]) {
  if (testIds.length === 0) return [];
  return getDb().select().from(E).where(inArray(E.testId, testIds));
}

/**
 * Who sits a paper: its batch and grade, active and registered by the paper's date — plus anyone who
 * already has a mark on it, so a score recorded before a student was deactivated or moved never
 * becomes uneditable.
 */
export async function paperRoster(exam: ExamRow) {
  const db = getDb();
  const [marks, cohort] = await Promise.all([db.select().from(M).where(eq(M.examId, exam.id)), db.select().from(S).where(and(eq(S.batchId, exam.batchId), eq(S.grade, exam.grade)))]);
  const marked = new Set(marks.map((m) => m.studentId));
  const missing = [...marked].filter((id) => !cohort.some((s) => s.id === id));
  const extra = missing.length ? await db.select().from(S).where(inArray(S.id, missing)) : [];
  const students: StudentRow[] = [...cohort.filter((s) => marked.has(s.id) || (s.isActive && (!s.registrationDate || s.registrationDate <= exam.examDate))), ...extra];
  return { students: sortByIndexNumber(students), marks };
}

type NewPaper = { part: number | null; subject: string; examDate: Date; maxMarks: number };
export type NewTest = { name: string; kind: TestKind; grade: number; batchId: string; papers: NewPaper[] };

const parseMax = (value: unknown, label: string) => {
  const max = Number(value);
  return Number.isFinite(max) && max > 0 && max <= 1000 ? max : `${label}: maximum marks must be a number above 0`;
};

/**
 * Validates a new test. A model exam is always two parts on one day; a test is two parts (on one day
 * or two) or a single paper. A string is a message for the person filling in the form.
 */
export async function parseNewTest(data: Record<string, unknown> | null): Promise<NewTest | string> {
  if (!data) return "Invalid request";
  const name = text(data.name, 80);
  if (!name) return "Give the test a name";
  const kind: TestKind = data.kind === "model" ? "model" : "test";
  if (!isGrade(Number(data.grade))) return "Choose the grade this test is for";
  const batch = await getBatch(data.batchId);
  if (!batch) return "Choose a batch for this test";

  const input = (Array.isArray(data.papers) ? data.papers : []) as Record<string, unknown>[];
  if (kind === "model" && input.length !== 2) return "A model exam has Part 1 and Part 2";
  if (input.length !== 1 && input.length !== 2) return "A test has one paper, or Part 1 and Part 2";

  const papers: NewPaper[] = [];
  for (const [i, p] of input.entries()) {
    const part = input.length === 2 ? i + 1 : null;
    const label = part ? `Part ${part}` : "The paper";
    // A model exam is sat in one sitting, so both parts take the first part's date.
    const examDate = parseDate(kind === "model" ? input[0]?.examDate : p?.examDate);
    if (!examDate) return `Choose the date of ${part ? `Part ${part}` : "the paper"}`;
    const maxMarks = parseMax(p?.maxMarks, label);
    if (typeof maxMarks === "string") return maxMarks;
    const subject = part ? `Part ${part}` : text(p?.subject, 80);
    if (!subject) return "Say what the paper is in (the subject)";
    papers.push({ part, subject, examDate, maxMarks });
  }
  return { name, kind, grade: Number(data.grade), batchId: batch.id, papers };
}

export type TestEdit = { name?: string; isPublished?: boolean; papers: { id: string; examDate?: Date; maxMarks?: number; subject?: string }[] };

/** Validates an edit: the name, each paper's date and maximum (a single paper's subject), and publishing. */
export function parseTestEdit(data: Record<string, unknown> | null, test: TestRow, papers: ExamRow[]): TestEdit | string {
  if (!data) return "Invalid request";
  const out: TestEdit = { papers: [] };
  if (data.name !== undefined) {
    const name = text(data.name, 80);
    if (!name) return "Give the test a name";
    out.name = name;
  }
  if (data.isPublished !== undefined) out.isPublished = Boolean(data.isPublished);

  for (const p of (Array.isArray(data.papers) ? data.papers : []) as Record<string, unknown>[]) {
    const paper = papers.find((x) => x.id === p?.id);
    if (!paper) return "That paper is not part of this test";
    const label = paperLabel(paper);
    const edit: TestEdit["papers"][number] = { id: paper.id };
    if (p.examDate !== undefined) {
      const date = parseDate(p.examDate);
      if (!date) return `Choose the date of ${label}`;
      edit.examDate = date;
    }
    if (p.maxMarks !== undefined) {
      const max = parseMax(p.maxMarks, label);
      if (typeof max === "string") return max;
      edit.maxMarks = max;
    }
    if (p.subject !== undefined && paper.part === null) {
      const subject = text(p.subject, 80);
      if (!subject) return "Say what the paper is in (the subject)";
      edit.subject = subject;
    }
    out.papers.push(edit);
  }

  if (test.kind === "model") {
    const dates = papers.map((paper) => (out.papers.find((e) => e.id === paper.id)?.examDate ?? paper.examDate).getTime());
    if (new Set(dates).size > 1) return "Both parts of a model exam are sat on the same day";
  }
  return out;
}
