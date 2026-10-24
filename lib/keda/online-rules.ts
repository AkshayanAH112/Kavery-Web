/**
 * Online papers: the rules both sides need — when a paper is open, when a sitting is over, and how an
 * answer is scored. No server imports, so the console, the exam page and the API share one copy.
 */

export type PaperMode = "practice" | "exam";
export type QuestionKind = "choice" | "short";
/** draft: not ready · scheduled: ready, not open yet · open · closed: past its closing time. */
export type PaperStatus = "draft" | "scheduled" | "open" | "closed";

/** An answer saved this soon after the deadline still counts: the last tap can be on the wire as time runs out. */
export const GRACE_MS = 20_000;
export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 6;
export const MAX_DURATION_MINUTES = 300;
export const MAX_RESPONSE_LENGTH = 500;

const time = (value: Date | string | number | null | undefined) => (value === null || value === undefined ? null : new Date(value).getTime());

export function paperStatus(paper: { isReady: boolean; opensAt: Date | string | null; closesAt: Date | string | null }, now = Date.now()): PaperStatus {
  const opens = time(paper.opensAt);
  const closes = time(paper.closesAt);
  if (!paper.isReady || opens === null || closes === null) return "draft";
  if (now < opens) return "scheduled";
  return now < closes ? "open" : "closed";
}

/** Submitted, or out of time. Nothing has to run at the deadline for a sitting to end. */
export function isFinished(attempt: { submittedAt: Date | string | null; deadline: Date | string }, now = Date.now()) {
  return attempt.submittedAt !== null || now > time(attempt.deadline)! + GRACE_MS;
}

/** When a finished sitting ended: when it was handed in, or its deadline. */
export const finishedAt = (attempt: { submittedAt: Date | string | null; deadline: Date | string }) => new Date(attempt.submittedAt ?? attempt.deadline);

/**
 * What a short answer is compared as: case, spacing, a trailing full stop and the invisible joiners
 * that Tamil text can carry are ignored, so "25 cm", "25cm" and "25CM." are the same answer.
 */
export function normalizeAnswer(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, "")
    .replace(/\.+$/, "");
}

const asNumber = (value: string) => (/^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null);

/** Whether a short answer is one of the accepted answers. "7.0" and "7" are the same number. */
export function matchesAccepted(response: string | null | undefined, accepted: string[]) {
  const given = normalizeAnswer(response ?? "");
  if (!given) return false;
  return accepted.some((a) => {
    const want = normalizeAnswer(a);
    if (!want) return false;
    if (want === given) return true;
    const x = asNumber(want);
    const y = asNumber(given);
    return x !== null && y !== null && x === y;
  });
}

type ScoredQuestion = { id: string; kind: string; answer: string | null; accepted: string[]; marks: number };
type ScoredAnswer = { questionId: string; choice: string | null; response: string | null; awarded: number | null };

/**
 * One question's marks, or null while a short answer waits for staff. A staff mark always wins; an
 * empty answer is 0; a short answer that matches an accepted one gets full marks; anything else is
 * left for a person to judge rather than marked wrong by a string compare.
 */
export function questionScore(question: ScoredQuestion, answer: ScoredAnswer | undefined): number | null {
  if (question.kind === "choice") return answer?.choice && answer.choice === question.answer ? question.marks : 0;
  if (answer?.awarded !== null && answer?.awarded !== undefined) return answer.awarded;
  if (!answer?.response?.trim()) return 0;
  return matchesAccepted(answer.response, question.accepted) ? question.marks : null;
}

/** A sitting's score so far, how many short answers still need marking, and the paper's total. */
export function attemptScore(questions: ScoredQuestion[], answers: ScoredAnswer[]) {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let toMark = 0;
  let answered = 0;
  for (const q of questions) {
    const a = byQuestion.get(q.id);
    if ((q.kind === "choice" && a?.choice) || (q.kind === "short" && a?.response?.trim())) answered++;
    const s = questionScore(q, a);
    if (s === null) toMark++;
    else score += s;
  }
  return { score: Math.round(score * 100) / 100, toMark, answered, max: questions.reduce((sum, q) => sum + q.marks, 0) };
}
