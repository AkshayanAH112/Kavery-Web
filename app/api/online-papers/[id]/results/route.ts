import { eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { answersOnPaper, examOf, getPaper, paperDoc, questionDoc, questionsOf, rosterFor } from "@/lib/keda/online";
import { attemptScore, isFinished } from "@/lib/keda/online-rules";
import { getBatch, sortByIndexNumber } from "@/lib/keda/server";
import { paperLabel } from "@/lib/keda/test-results";

const { onlineAttempts: OA, marks: M, students: S } = schema;

/**
 * Who has sat the paper and how they did: every student on its roster (and anyone who sat it and has
 * since left it), their sitting, score and short answers still to mark, and every answer given — the
 * marking screen works from these. For an exam paper, how many marks the test paper already holds.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/online-papers/[id]/results">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return Response.json({ error: "Online paper not found" }, { status: 404 });

  const db = getDb();
  const [questions, roster, attempts, answers, linked, batch] = await Promise.all([
    questionsOf(paper.id),
    rosterFor(paper),
    db.select().from(OA).where(eq(OA.paperId, paper.id)),
    answersOnPaper(paper.id),
    examOf(paper),
    getBatch(paper.batchId),
  ]);
  const onRoster = new Set(roster.map((s) => s.id));
  const others = attempts.map((a) => a.studentId).filter((id) => !onRoster.has(id));
  const extra = others.length ? await db.select().from(S).where(inArray(S.id, others.slice(0, 90))) : [];
  const entered = linked ? await db.select({ studentId: M.studentId }).from(M).where(eq(M.examId, linked.exam.id)) : [];

  const now = Date.now();
  const rows = sortByIndexNumber([...roster, ...extra]).map((s) => {
    const attempt = attempts.find((a) => a.studentId === s.id);
    return {
      student: { _id: s.id, name: s.name, registrationNumber: s.registrationNumber ?? null },
      onRoster: onRoster.has(s.id),
      hasMark: entered.some((m) => m.studentId === s.id),
      attempt: attempt
        ? {
            _id: attempt.id,
            startedAt: attempt.startedAt.toISOString(),
            deadline: attempt.deadline.toISOString(),
            submittedAt: attempt.submittedAt?.toISOString() ?? null,
            finished: isFinished(attempt, now),
            ...attemptScore(
              questions,
              answers.filter((a) => a.attemptId === attempt.id),
            ),
          }
        : null,
    };
  });

  return Response.json({
    now: new Date(now).toISOString(),
    paper: paperDoc(paper, batch),
    questions: questions.map(questionDoc),
    rows,
    answers: answers.map((a) => ({ attemptId: a.attemptId, questionId: a.questionId, choice: a.choice, response: a.response, awarded: a.awarded })),
    exam: linked
      ? { _id: linked.exam.id, label: paperLabel(linked.exam), maxMarks: linked.exam.maxMarks, testId: linked.test?.id ?? null, testName: linked.test?.name ?? "", isPublished: linked.test?.isPublished ?? false, entered: entered.length }
      : null,
  });
}
