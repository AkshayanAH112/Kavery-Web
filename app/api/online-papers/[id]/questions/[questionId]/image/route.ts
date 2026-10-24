import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, getEnv, schema } from "@/lib/db";
import { getQuestion, imageKey, questionDoc } from "@/lib/keda/online";
import { isId } from "@/lib/keda/server";
import { deletePrivateFiles, storePrivateFile } from "@/lib/private-files";

const { onlineQuestions: OQ } = schema;

/**
 * A question's picture, or one of its answers' (`?option=<id>`). Staff only; students read pictures
 * through /api/public/online. The key is looked up from the question, never taken from the request.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions/[questionId]/image">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const { id, questionId } = await params;
  const key = isId(id) ? await imageKey(id, questionId, new URL(request.url).searchParams.get("option")) : null;
  const object = key ? await getEnv().MEDIA.get(key) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}

async function load(params: Promise<{ id: string; questionId: string }>) {
  const { id, questionId } = await params;
  return getQuestion(id, questionId);
}

/** Sets the picture (form fields `file`, and `option` for an answer's). The one it replaces is deleted. */
export async function POST(request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions/[questionId]/image">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const question = await load(params);
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const option = String(form?.get("option") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Choose a picture to upload." }, { status: 400 });
  if (option && !question.options.some((o) => o.id === option)) return Response.json({ error: "That answer is not on this question." }, { status: 400 });

  const stored = await storePrivateFile(file, "paper", "The picture");
  if (!stored.ok) return Response.json({ error: stored.error }, { status: 400 });
  const old = option ? question.options.find((o) => o.id === option)!.image : question.image;
  const set = option ? { options: question.options.map((o) => (o.id === option ? { ...o, image: stored.key } : o)) } : { image: stored.key };
  const [updated] = await getDb().update(OQ).set({ ...set, updatedAt: new Date() }).where(eq(OQ.id, question.id)).returning();
  await deletePrivateFiles([old]);
  return Response.json({ question: questionDoc(updated) });
}

/** Removes the picture (`?option=<id>` for an answer's). */
export async function DELETE(request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions/[questionId]/image">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const question = await load(params);
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });
  const option = new URL(request.url).searchParams.get("option");
  const old = option ? question.options.find((o) => o.id === option)?.image : question.image;
  const set = option ? { options: question.options.map((o) => (o.id === option ? { ...o, image: null } : o)) } : { image: null };
  const [updated] = await getDb().update(OQ).set({ ...set, updatedAt: new Date() }).where(eq(OQ.id, question.id)).returning();
  await deletePrivateFiles([old]);
  return Response.json({ question: questionDoc(updated) });
}
