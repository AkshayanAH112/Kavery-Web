import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { deleteOnlinePapers, examOf, getPaper, hasAttempts, paperDoc, parsePaperEdit, questionDoc, questionsOf, readyProblems, type PaperRow } from "@/lib/keda/online";
import { getBatch, readBody } from "@/lib/keda/server";
import { paperLabel } from "@/lib/keda/test-results";
import { pushInBackground } from "@/lib/push";

const { onlinePapers: OP, onlineQuestions: OQ } = schema;
const NOT_FOUND = () => Response.json({ error: "Online paper not found" }, { status: 404 });

/** The paper, its questions with the answer key, what still stops it being given out, and the test paper it fills. */
async function view(paper: PaperRow) {
  const [questions, linked, locked, batch] = await Promise.all([questionsOf(paper.id), examOf(paper), hasAttempts(paper.id), getBatch(paper.batchId)]);
  return {
    paper: paperDoc(paper, batch),
    questions: questions.map(questionDoc),
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    problems: readyProblems(paper, questions, linked?.exam.maxMarks ?? null),
    locked,
    exam: linked ? { _id: linked.exam.id, label: paperLabel(linked.exam), maxMarks: linked.exam.maxMarks, testId: linked.test?.id ?? null, testName: linked.test?.name ?? "" } : null,
  };
}

export async function GET(_request: Request, { params }: RouteContext<"/api/online-papers/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return NOT_FOUND();
  return Response.json(await view(paper));
}

/**
 * Settings, question order, and the ready switch. A paper is made ready only when nothing in
 * `readyProblems` is left; it can be taken back to draft only while nobody has started it.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/online-papers/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return NOT_FOUND();
  const body = await readBody(request);
  const set = parsePaperEdit(body);
  if (typeof set === "string") return Response.json({ error: set }, { status: 400 });

  const db = getDb();
  const writes = [];
  if (Array.isArray(body?.order)) {
    const questions = await questionsOf(paper.id);
    const order = body.order as unknown[];
    if (order.length !== questions.length || !questions.every((q) => order.includes(q.id))) return Response.json({ error: "Send every question of the paper, in the new order" }, { status: 400 });
    writes.push(...order.map((id, position) => db.update(OQ).set({ position }).where(eq(OQ.id, id as string))));
  }

  const next = { ...paper, ...set };
  const making = body?.isReady === true && !paper.isReady;
  if (body?.isReady !== undefined) {
    if (making) {
      const problems = readyProblems(next, await questionsOf(paper.id), (await examOf(paper))?.exam.maxMarks ?? null);
      if (problems.length) return Response.json({ error: `Not ready yet: ${problems.join(" ")}` }, { status: 409 });
    } else if (body.isReady === false && paper.isReady && (await hasAttempts(paper.id))) {
      return Response.json({ error: "Students have already started this paper, so it cannot go back to draft." }, { status: 409 });
    }
    set.isReady = Boolean(body.isReady);
  } else if (paper.isReady && next.opensAt && next.closesAt && next.closesAt <= next.opensAt) {
    return Response.json({ error: "The paper must close after it opens." }, { status: 400 });
  }
  if (paper.isReady && (set.opensAt === null || set.closesAt === null)) return Response.json({ error: "A paper given to students needs an opening and a closing time." }, { status: 400 });

  if (Object.keys(set).length) writes.push(db.update(OP).set(set).where(eq(OP.id, paper.id)));
  if (writes.length) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);

  const updated = (await getPaper(paper.id))!;
  if (making && updated.opensAt) {
    const opens = updated.opensAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    pushInBackground("keda", { title: `Online exam: ${updated.title}`, body: `Grade ${updated.grade}. Opens ${opens}. Sit it on the parent page.`, url: "/{locale}/parents", tag: `online-${updated.id}` });
  }
  return Response.json(await view(updated));
}

/** Deletes the paper with every question, sitting and answer. Marks already copied to a test stay. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/online-papers/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return NOT_FOUND();
  await deleteOnlinePapers([paper.id]);
  return Response.json({ success: true });
}
