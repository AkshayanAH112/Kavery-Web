import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { isId, readBody } from "@/lib/keda/server";

const { onlineAttempts: OA, onlineAnswers: OAn } = schema;

async function load(params: Promise<{ id: string; attemptId: string }>) {
  const { id, attemptId } = await params;
  if (!isId(id) || !isId(attemptId)) return null;
  return (await getDb().query.onlineAttempts.findFirst({ where: and(eq(OA.id, attemptId), eq(OA.paperId, id)) })) ?? null;
}
const NOT_FOUND = () => Response.json({ error: "That sitting was not found" }, { status: 404 });

/**
 * More time for one student (`{ addMinutes }`): a phone that died, a late start in class. The time is
 * added from now if their deadline has passed, and a handed-in paper is opened again for them. It may
 * run past the paper's closing time — that is the point of it.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/online-papers/[id]/attempts/[attemptId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const attempt = await load(params);
  if (!attempt) return NOT_FOUND();
  const minutes = Number((await readBody(request))?.addMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return Response.json({ error: "Add between 1 and 120 minutes" }, { status: 400 });
  const from = Math.max(Date.now(), attempt.deadline.getTime());
  await getDb()
    .update(OA)
    .set({ deadline: new Date(from + minutes * 60_000), submittedAt: null })
    .where(eq(OA.id, attempt.id));
  return Response.json({ success: true });
}

/** Clears a student's sitting and answers so they can start again from the beginning. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/online-papers/[id]/attempts/[attemptId]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const attempt = await load(params);
  if (!attempt) return NOT_FOUND();
  const db = getDb();
  await db.batch([db.delete(OAn).where(eq(OAn.attemptId, attempt.id)), db.delete(OA).where(eq(OA.id, attempt.id))]);
  return Response.json({ success: true });
}
