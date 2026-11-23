import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { answersOnPaper, examOf, getPaper, questionsOf, rosterFor } from "@/lib/keda/online";
import { attemptScore, isFinished, paperStatus } from "@/lib/keda/online-rules";
import { readBody } from "@/lib/keda/server";
import { paperLabel } from "@/lib/keda/test-results";

const { onlineAttempts: OA, marks: M } = schema;

/**
 * Copies an exam paper's online scores into its test paper's marks, where they are ranked and
 * published like any other. Only once the paper has closed, every sitting is over and every short
 * answer is marked. A student who sat it gets their score, replacing any mark already there.
 * `absentForMissing` marks the students who never started as absent — but never over a mark staff
 * have entered by hand (a child who sat it on paper keeps that mark).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/online-papers/[id]/send-marks">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return Response.json({ error: "Online paper not found" }, { status: 404 });
  const linked = await examOf(paper);
  if (!linked) return Response.json({ error: "Only an exam paper's scores go to a test. A practice paper's stay with the student." }, { status: 400 });
  const refuse = (error: string) => Response.json({ error }, { status: 409 });

  const now = Date.now();
  if (paperStatus(paper, now) !== "closed") return refuse("Wait until the paper has closed, so that everyone has finished.");
  const db = getDb();
  const [questions, roster, attempts, answers, entered] = await Promise.all([
    questionsOf(paper.id),
    rosterFor(paper),
    db.select().from(OA).where(eq(OA.paperId, paper.id)),
    answersOnPaper(paper.id),
    db.select({ studentId: M.studentId }).from(M).where(eq(M.examId, linked.exam.id)),
  ]);
  const running = attempts.filter((a) => !isFinished(a, now)).length;
  if (running) return refuse(`${running} student${running === 1 ? " is" : "s are"} still sitting the paper (given extra time). Copy the scores once they finish.`);

  const scores = attempts.map((a) => ({ studentId: a.studentId, ...attemptScore(questions, answers.filter((x) => x.attemptId === a.id)) }));
  const unmarked = scores.reduce((n, s) => n + s.toMark, 0);
  if (unmarked) return refuse(`${unmarked} short answer${unmarked === 1 ? " is" : "s are"} still to be marked.`);
  const over = scores.find((s) => s.score > linked.exam.maxMarks);
  if (over) return refuse(`A score of ${over.score} is above ${paperLabel(linked.exam)}'s maximum of ${linked.exam.maxMarks}. Change the maximum on the test first.`);

  const sat = new Set(attempts.map((a) => a.studentId));
  const hasMark = new Set(entered.map((m) => m.studentId));
  const absentees = (await readBody(request))?.absentForMissing ? roster.filter((s) => !sat.has(s.id) && !hasMark.has(s.id)) : [];
  const rows = [
    ...scores.map((s) => ({ examId: linked.exam.id, studentId: s.studentId, marks: s.score, isAbsent: false })),
    ...absentees.map((s) => ({ examId: linked.exam.id, studentId: s.id, marks: 0, isAbsent: true })),
  ];
  if (rows.length === 0) return refuse("Nobody sat the paper, and there is no one to mark absent.");

  // All or nothing, like any batch of marks.
  const writes = rows.map((row) => db.insert(M).values(row).onConflictDoUpdate({ target: [M.examId, M.studentId], set: { marks: row.marks, isAbsent: row.isAbsent } }));
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return Response.json({ success: true, scores: scores.length, absent: absentees.length, testId: linked.test?.id ?? null });
}
