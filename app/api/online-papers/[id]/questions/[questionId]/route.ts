import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getQuestion, hasAttempts, parseQuestionEdit, questionDoc } from "@/lib/keda/online";
import { readBody } from "@/lib/keda/server";
import { deletePrivateFiles } from "@/lib/private-files";

const { onlineQuestions: OQ } = schema;

async function load(params: Promise<{ id: string; questionId: string }>) {
  const { id, questionId } = await params;
  return getQuestion(id, questionId);
}
const NOT_FOUND = () => Response.json({ error: "Question not found" }, { status: 404 });

export async function PATCH(request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions/[questionId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const question = await load(params);
  if (!question) return NOT_FOUND();
  const edit = parseQuestionEdit(await readBody(request), question, await hasAttempts(question.paperId));
  if (typeof edit === "string") return Response.json({ error: edit }, { status: 400 });

  const [updated] = await getDb().update(OQ).set({ ...edit.set, updatedAt: new Date() }).where(eq(OQ.id, question.id)).returning();
  await deletePrivateFiles(edit.removedImages);
  return Response.json({ question: questionDoc(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions/[questionId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const question = await load(params);
  if (!question) return NOT_FOUND();
  if (await hasAttempts(question.paperId)) return Response.json({ error: "Students have started this paper, so its questions cannot be removed." }, { status: 409 });
  await getDb().delete(OQ).where(eq(OQ.id, question.id));
  await deletePrivateFiles([question.image, ...question.options.map((o) => o.image)]);
  return Response.json({ success: true });
}
