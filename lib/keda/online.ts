/**
 * Online papers on the server: the staff's view of a paper, what a student is shown, and the checks
 * on everything either side sends. The scoring and timing rules are in ./online-rules (shared with
 * the browser); this file is where they meet the database.
 *
 * What a student is never sent: the answer key, before the paper may be reviewed (a practice paper
 * once it has closed, an exam paper once its test is published), and any other student's anything.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { deletePrivateFiles } from "@/lib/private-files";
import { getExam, getTest, paperRoster } from "./exams";
import { isGrade, isId, sortByIndexNumber, text, type BatchRow, type StudentRow } from "./server";
import { paperLabel } from "./test-results";
import { attemptScore, finishedAt, isFinished, MAX_DURATION_MINUTES, MAX_OPTIONS, MAX_RESPONSE_LENGTH, paperStatus, questionScore, type PaperMode, type QuestionKind } from "./online-rules";

const { onlinePapers: OP, onlineQuestions: OQ, onlineAttempts: OA, onlineAnswers: OAn, students: S } = schema;

export type PaperRow = typeof OP.$inferSelect;
export type QuestionRow = typeof OQ.$inferSelect;
export type AttemptRow = typeof OA.$inferSelect;
export type AnswerRow = typeof OAn.$inferSelect;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export async function getPaper(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.onlinePapers.findFirst({ where: eq(OP.id, id) })) ?? null;
}

/** A question, only if it is on that paper. */
export async function getQuestion(paperId: unknown, questionId: unknown) {
  if (!isId(paperId) || !isId(questionId)) return null;
  return (await getDb().query.onlineQuestions.findFirst({ where: and(eq(OQ.id, questionId), eq(OQ.paperId, paperId)) })) ?? null;
}

export async function questionsOf(paperId: string) {
  return getDb().select().from(OQ).where(eq(OQ.paperId, paperId)).orderBy(asc(OQ.position), asc(OQ.createdAt));
}

/** Whether any student has started: from then on questions cannot be added, removed or re-weighted. */
export async function hasAttempts(paperId: string) {
  return !!(await getDb().query.onlineAttempts.findFirst({ where: eq(OA.paperId, paperId), columns: { id: true } }));
}

/** The paper of a test this fills, with its test — null for a practice paper. */
export async function examOf(paper: PaperRow) {
  if (!paper.examId) return null;
  const exam = await getExam(paper.examId);
  if (!exam) return null;
  return { exam, test: await getTest(exam.testId) };
}

/* ------------------------------------------------------------------ staff view */

export const paperDoc = (p: PaperRow, batch?: BatchRow | null) => ({
  _id: p.id,
  title: p.title,
  mode: p.mode as PaperMode,
  grade: p.grade,
  batchId: batch ? { _id: batch.id, name: batch.name } : p.batchId,
  examId: p.examId,
  instructions: p.instructions ?? "",
  opensAt: iso(p.opensAt),
  closesAt: iso(p.closesAt),
  durationMinutes: p.durationMinutes,
  shuffle: p.shuffle,
  isReady: p.isReady,
  status: paperStatus(p),
  createdAt: p.createdAt.toISOString(),
});

/** A question with its answer key — for staff only. `version` changes whenever a picture might have. */
export const questionDoc = (q: QuestionRow) => ({
  _id: q.id,
  kind: q.kind as QuestionKind,
  prompt: q.prompt,
  hasImage: !!q.image,
  options: q.options.map((o) => ({ id: o.id, text: o.text, hasImage: !!o.image })),
  answer: q.answer,
  accepted: q.accepted,
  marks: q.marks,
  version: q.updatedAt.getTime(),
});

const total = (questions: { marks: number }[]) => Math.round(questions.reduce((sum, q) => sum + q.marks, 0) * 100) / 100;

/** Everything that stops a paper being given to students. Empty means it can be made ready. */
export function readyProblems(paper: PaperRow, questions: QuestionRow[], maxMarks: number | null) {
  const problems: string[] = [];
  if (!paper.opensAt || !paper.closesAt) problems.push("Set when the paper opens and when it closes.");
  else if (paper.closesAt <= paper.opensAt) problems.push("The paper must close after it opens.");
  if (questions.length === 0) problems.push("Add at least one question.");
  questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (!q.prompt.trim() && !q.image) problems.push(`${n} has no question text or picture.`);
    if (q.kind !== "choice") return;
    if (q.options.length < 2) problems.push(`${n} needs at least two answers to choose from.`);
    else if (q.options.some((o) => !o.text.trim() && !o.image)) problems.push(`${n} has an empty answer to choose from.`);
    if (!q.answer || !q.options.some((o) => o.id === q.answer)) problems.push(`${n} has no correct answer chosen.`);
  });
  if (maxMarks !== null && questions.length > 0 && total(questions) !== maxMarks) {
    problems.push(`The questions add up to ${total(questions)} marks, but this paper is out of ${maxMarks}. Change the questions' marks, or the paper's maximum on the test.`);
  }
  return problems;
}

/* ---------------------------------------------------------------- validation */

/** A new paper: `{ examId }` sets one up for a paper of a test; `{ title, batchId, grade }` is a practice paper. */
export async function parseNewPaper(data: Record<string, unknown> | null) {
  if (!data) return "Invalid request";
  if (data.examId !== undefined) {
    const exam = await getExam(data.examId);
    if (!exam) return "That paper of a test was not found";
    const test = await getTest(exam.testId);
    if (!test) return "That paper of a test was not found";
    return { title: `${test.name} — ${paperLabel(exam)}`, mode: "exam" as const, batchId: exam.batchId, grade: exam.grade, examId: exam.id };
  }
  const title = text(data.title, 120);
  if (!title) return "Give the paper a name";
  if (!isGrade(Number(data.grade))) return "Choose the grade this paper is for";
  if (!isId(data.batchId) || !(await getDb().query.batches.findFirst({ where: eq(schema.batches.id, data.batchId) }))) return "Choose a batch for this paper";
  return { title, mode: "practice" as const, batchId: data.batchId, grade: Number(data.grade), examId: null };
}

const readTime = (value: unknown): Date | null | undefined => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** The settings staff can change. `isReady` and question order are handled by the route. */
export function parsePaperEdit(data: Record<string, unknown> | null) {
  if (!data) return "Invalid request";
  const set: Partial<typeof OP.$inferInsert> = {};
  if (data.title !== undefined) {
    const title = text(data.title, 120);
    if (!title) return "Give the paper a name";
    set.title = title;
  }
  if (data.instructions !== undefined) set.instructions = text(data.instructions, 2000) || null;
  for (const key of ["opensAt", "closesAt"] as const) {
    if (data[key] === undefined) continue;
    const at = readTime(data[key]);
    if (at === undefined) return `Choose when the paper ${key === "opensAt" ? "opens" : "closes"}`;
    set[key] = at;
  }
  if (data.durationMinutes !== undefined) {
    const minutes = Number(data.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_DURATION_MINUTES) return `The time allowed must be between 1 and ${MAX_DURATION_MINUTES} minutes`;
    set.durationMinutes = minutes;
  }
  if (data.shuffle !== undefined) set.shuffle = Boolean(data.shuffle);
  return set;
}

const optionId = () => crypto.randomUUID().slice(0, 8);

/**
 * A question edit. Once a student has started (`locked`), the shape is fixed — kind, marks and the set
 * of options — because every sitting's order and score depend on it; wording, pictures and the
 * answer key can still be corrected, and a corrected key re-marks everyone.
 */
export function parseQuestionEdit(data: Record<string, unknown> | null, question: QuestionRow, locked: boolean) {
  if (!data) return "Invalid request";
  const set: Partial<typeof OQ.$inferInsert> = {};
  const removedImages: string[] = [];
  const lockedMessage = "Students have started this paper, so questions can no longer change shape. The wording and the correct answer can still be corrected.";

  const kind = data.kind === undefined ? question.kind : data.kind;
  if (kind !== "choice" && kind !== "short") return "A question is multiple choice or a short answer";
  if (kind !== question.kind) {
    if (locked) return lockedMessage;
    set.kind = kind;
  }
  if (data.prompt !== undefined) set.prompt = text(data.prompt, 2000);
  if (data.marks !== undefined) {
    const marks = Number(data.marks);
    if (!Number.isFinite(marks) || marks <= 0 || marks > 100 || Math.round(marks * 2) !== marks * 2) return "Marks for a question must be above 0, in whole or half marks";
    if (marks !== question.marks) {
      if (locked) return lockedMessage;
      set.marks = marks;
    }
  }

  let options = question.options;
  if (kind === "choice" && Array.isArray(data.options)) {
    const input = data.options as { id?: unknown; text?: unknown }[];
    if (input.length > MAX_OPTIONS) return `A question can have up to ${MAX_OPTIONS} answers to choose from`;
    options = input.map((o) => {
      const kept = question.options.find((x) => x.id === o?.id);
      return { id: kept?.id ?? optionId(), text: text(o?.text, 300), image: kept?.image ?? null };
    });
    const sameSet = options.length === question.options.length && options.every((o) => question.options.some((x) => x.id === o.id));
    if (locked && !sameSet) return lockedMessage;
    for (const old of question.options) if (old.image && !options.some((o) => o.id === old.id)) removedImages.push(old.image);
    set.options = options;
  }
  if (kind === "short" && question.kind === "choice") {
    // Switching to a short answer drops the choices and their pictures.
    for (const old of question.options) if (old.image) removedImages.push(old.image);
    set.options = [];
    options = [];
    set.answer = null;
  }

  if (data.answer !== undefined && kind === "choice") {
    if (data.answer === null) set.answer = null;
    else if (typeof data.answer === "string" && options.some((o) => o.id === data.answer)) set.answer = data.answer;
    else if (typeof data.answer === "number" && options[data.answer]) set.answer = options[data.answer].id;
    else return "Choose the correct answer from the question's answers";
  }
  if (set.options && set.answer === undefined && question.answer && !options.some((o) => o.id === question.answer)) set.answer = null;

  if (data.accepted !== undefined) {
    if (!Array.isArray(data.accepted)) return "Accepted answers must be a list";
    set.accepted = data.accepted.map((a) => text(a, 100)).filter(Boolean).slice(0, 10);
  }
  return { set, removedImages };
}

/** A blank question for the editor to fill: multiple choice, four empty answers, one mark. */
export const blankQuestion = (paperId: string, position: number) => ({
  paperId,
  position,
  kind: "choice",
  prompt: "",
  options: Array.from({ length: 4 }, () => ({ id: optionId(), text: "", image: null })),
  marks: 1,
});

/* ------------------------------------------------------------------- rosters */

/** Who may sit a paper: an exam paper's own roster, or the active students of the batch and grade. */
export async function rosterFor(paper: PaperRow): Promise<StudentRow[]> {
  if (paper.examId) {
    const exam = await getExam(paper.examId);
    if (exam) return (await paperRoster(exam)).students;
  }
  const rows = await getDb()
    .select()
    .from(S)
    .where(and(eq(S.batchId, paper.batchId), eq(S.grade, paper.grade), eq(S.isActive, true)));
  return sortByIndexNumber(rows);
}

/** Every answer on a paper, through its sittings — one query, however many students sat it. */
export async function answersOnPaper(paperId: string) {
  return getDb()
    .select({ answer: OAn })
    .from(OAn)
    .innerJoin(OA, eq(OAn.attemptId, OA.id))
    .where(eq(OA.paperId, paperId))
    .then((rows) => rows.map((r) => r.answer));
}

const imageKeys = (questions: QuestionRow[]) => questions.flatMap((q) => [q.image, ...q.options.map((o) => o.image)]).filter((k): k is string => !!k);

/** Deletes papers with their questions, sittings, answers and pictures. */
export async function deleteOnlinePapers(paperIds: string[]) {
  if (paperIds.length === 0) return;
  const db = getDb();
  const questions = await db.select().from(OQ).where(inArray(OQ.paperId, paperIds));
  const attempts = db.select({ id: OA.id }).from(OA).where(inArray(OA.paperId, paperIds));
  await db.batch([
    db.delete(OAn).where(inArray(OAn.attemptId, attempts)),
    db.delete(OA).where(inArray(OA.paperId, paperIds)),
    db.delete(OQ).where(inArray(OQ.paperId, paperIds)),
    db.delete(OP).where(inArray(OP.id, paperIds)),
  ]);
  await deletePrivateFiles(imageKeys(questions));
}

/* ------------------------------------------------------------- student side */

/** May this student see the paper? Their own batch and grade, and staff have made it ready. */
export const isForStudent = (paper: PaperRow, student: StudentRow) => paper.isReady && paper.batchId === student.batchId && paper.grade === student.grade;

/** Whether the key may be shown: a practice paper once it has closed, an exam paper once its test is published. */
export async function isReviewable(paper: PaperRow, now = Date.now()) {
  if (paper.mode === "practice") return paperStatus(paper, now) === "closed";
  return !!(await examOf(paper))?.test?.isPublished;
}

const shuffled = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function newOrder(questions: QuestionRow[], shuffle: boolean) {
  const mix = <T,>(items: T[]) => (shuffle ? shuffled(items) : items);
  return {
    questions: mix(questions.map((q) => q.id)),
    options: Object.fromEntries(questions.filter((q) => q.kind === "choice").map((q) => [q.id, mix(q.options.map((o) => o.id))])),
  };
}

/** The papers on a child's card on the parent page, newest first, with where the child is with each. */
export async function papersForStudent(student: StudentRow) {
  if (!student.batchId) return [];
  const db = getDb();
  const papers = await db
    .select()
    .from(OP)
    .where(and(eq(OP.batchId, student.batchId), eq(OP.grade, student.grade), eq(OP.isReady, true)));
  if (papers.length === 0) return [];
  const attempts = await db
    .select()
    .from(OA)
    .where(and(eq(OA.studentId, student.id), inArray(OA.paperId, papers.map((p) => p.id))));

  // A practice paper's score is the child's own, shown once they finish. An exam's waits for its test to be published.
  const finishedPractice = attempts.filter((a) => isFinished(a) && papers.find((p) => p.id === a.paperId)?.mode === "practice");
  const scores = new Map<string, ReturnType<typeof attemptScore>>();
  for (const a of finishedPractice) {
    const [questions, answers] = await Promise.all([questionsOf(a.paperId), db.select().from(OAn).where(eq(OAn.attemptId, a.id))]);
    scores.set(a.id, attemptScore(questions, answers));
  }

  return papers
    .sort((a, b) => (b.opensAt?.getTime() ?? 0) - (a.opensAt?.getTime() ?? 0))
    .slice(0, 20)
    .map((p) => {
      const attempt = attempts.find((a) => a.paperId === p.id);
      const score = attempt && scores.get(attempt.id);
      return {
        id: p.id,
        title: p.title,
        mode: p.mode as PaperMode,
        opensAt: iso(p.opensAt),
        closesAt: iso(p.closesAt),
        durationMinutes: p.durationMinutes,
        status: paperStatus(p),
        attempt: attempt ? { finished: isFinished(attempt), deadline: attempt.deadline.toISOString() } : null,
        result: score ? { score: score.score, max: score.max, toMark: score.toMark } : null,
      };
    });
}

/**
 * The exam page for one student. Before they start: what the paper is. Once started: the questions
 * in their own order with their saved answers — no key. Once finished: their score on a practice
 * paper, and the key when the paper may be reviewed.
 */
export async function studentPaperView(paper: PaperRow, student: StudentRow) {
  const now = Date.now();
  const db = getDb();
  const [questions, attempt] = await Promise.all([
    questionsOf(paper.id),
    db.query.onlineAttempts.findFirst({ where: and(eq(OA.paperId, paper.id), eq(OA.studentId, student.id)) }),
  ]);
  const view = {
    now: new Date(now).toISOString(),
    paper: {
      id: paper.id,
      title: paper.title,
      mode: paper.mode as PaperMode,
      instructions: paper.instructions ?? "",
      durationMinutes: paper.durationMinutes,
      opensAt: iso(paper.opensAt),
      closesAt: iso(paper.closesAt),
      status: paperStatus(paper, now),
      questionCount: questions.length,
      totalMarks: total(questions),
    },
    student: { name: student.name, registrationNumber: student.registrationNumber ?? "" },
  };
  if (!attempt) return { ...view, attempt: null };

  const answers = await db.select().from(OAn).where(eq(OAn.attemptId, attempt.id));
  const finished = isFinished(attempt, now);
  const review = finished && (await isReviewable(paper, now));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = [...attempt.order.questions.map((id) => byId.get(id)).filter((q): q is QuestionRow => !!q), ...questions.filter((q) => !attempt.order.questions.includes(q.id))];
  const score = attemptScore(questions, answers);

  return {
    ...view,
    attempt: {
      startedAt: attempt.startedAt.toISOString(),
      deadline: attempt.deadline.toISOString(),
      finished,
      finishedAt: finished ? finishedAt(attempt).toISOString() : null,
      handedIn: attempt.submittedAt !== null,
    },
    questions: ordered.map((q) => {
      const order = attempt.order.options[q.id] ?? [];
      const options = [...order.map((id) => q.options.find((o) => o.id === id)).filter((o) => !!o), ...q.options.filter((o) => !order.includes(o.id))];
      const answer = answers.find((a) => a.questionId === q.id);
      return {
        id: q.id,
        kind: q.kind as QuestionKind,
        prompt: q.prompt,
        hasImage: !!q.image,
        version: q.updatedAt.getTime(),
        marks: q.marks,
        options: options.map((o) => ({ id: o.id, text: o.text, hasImage: !!o.image })),
        ...(review ? { key: { answer: q.answer, accepted: q.accepted, awarded: questionScore(q, answer) } } : {}),
      };
    }),
    answers: Object.fromEntries(answers.map((a) => [a.questionId, { choice: a.choice, response: a.response }])),
    result: finished && (paper.mode === "practice" || review) ? { score: score.score, max: score.max, toMark: score.toMark } : null,
  };
}

/** Starts the student's sitting, or returns the one they already have. Their deadline never passes the closing time. */
export async function startAttempt(paper: PaperRow, student: StudentRow) {
  const db = getDb();
  const existing = await db.query.onlineAttempts.findFirst({ where: and(eq(OA.paperId, paper.id), eq(OA.studentId, student.id)) });
  if (existing) return existing;
  const now = Date.now();
  const questions = await questionsOf(paper.id);
  const deadline = Math.min(now + paper.durationMinutes * 60_000, paper.closesAt!.getTime());
  // Two taps on Start from two tabs: the unique index keeps one sitting, and both get it back.
  await db
    .insert(OA)
    .values({ paperId: paper.id, studentId: student.id, startedAt: new Date(now), deadline: new Date(deadline), order: newOrder(questions, paper.shuffle) })
    .onConflictDoNothing();
  return (await db.query.onlineAttempts.findFirst({ where: and(eq(OA.paperId, paper.id), eq(OA.studentId, student.id)) }))!;
}

/** One answer from the exam page. A string is the reason it was refused. */
export async function saveAnswer(paper: PaperRow, student: StudentRow, body: Record<string, unknown>) {
  const db = getDb();
  const attempt = await db.query.onlineAttempts.findFirst({ where: and(eq(OA.paperId, paper.id), eq(OA.studentId, student.id)) });
  if (!attempt) return { error: "Start the paper first.", code: "not_started" } as const;
  if (isFinished(attempt)) return { error: "Time is up: this paper has been handed in.", code: "finished" } as const;
  const question = await getQuestion(paper.id, body.questionId);
  if (!question) return { error: "That question is not on this paper.", code: "bad_answer" } as const;

  let value: { choice: string | null; response: string | null };
  if (question.kind === "choice") {
    if (body.choice !== null && !question.options.some((o) => o.id === body.choice)) return { error: "That answer is not one of the choices.", code: "bad_answer" } as const;
    value = { choice: (body.choice as string | null) ?? null, response: null };
  } else {
    if (body.response !== null && typeof body.response !== "string") return { error: "Type the answer as text.", code: "bad_answer" } as const;
    value = { choice: null, response: body.response ? body.response.slice(0, MAX_RESPONSE_LENGTH) : null };
  }
  await db
    .insert(OAn)
    .values({ attemptId: attempt.id, questionId: question.id, ...value })
    .onConflictDoUpdate({ target: [OAn.attemptId, OAn.questionId], set: value });
  return { ok: true } as const;
}

export async function submitAttempt(paper: PaperRow, student: StudentRow) {
  const db = getDb();
  const attempt = await db.query.onlineAttempts.findFirst({ where: and(eq(OA.paperId, paper.id), eq(OA.studentId, student.id)) });
  if (!attempt) return false;
  if (!isFinished(attempt)) await db.update(OA).set({ submittedAt: new Date() }).where(eq(OA.id, attempt.id));
  return true;
}

/** A picture's storage key, looked up from the question — a client never names one. */
export async function imageKey(paperId: string, questionId: unknown, optionId: unknown) {
  const question = await getQuestion(paperId, questionId);
  if (!question) return null;
  if (optionId === null || optionId === undefined || optionId === "") return question.image;
  return question.options.find((o) => o.id === optionId)?.image ?? null;
}
