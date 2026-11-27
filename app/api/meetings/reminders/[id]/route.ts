import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";

const R = schema.meetingReminders;
const Body = z.object({ status: z.enum(["open", "contacted"]) });

/** Staff mark a family as contacted (or undo it). Resolving happens by itself when the parent next comes. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/meetings/reminders/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose contacted or open." }, { status: 400 });
  const db = getDb();
  const [reminder] = await db.select({ studentId: R.studentId }).from(R).where(eq(R.id, (await params).id)).limit(1);
  if (!reminder) return Response.json({ error: "That reminder no longer exists." }, { status: 404 });
  // The whole family at once: contacting them covers every meeting they have missed so far.
  const contacted = parsed.data.status === "contacted";
  await db
    .update(R)
    .set({ status: parsed.data.status, contactedAt: contacted ? new Date() : null, contactedBy: contacted ? auth.session.userId : null })
    .where(and(eq(R.studentId, reminder.studentId), ne(R.status, "resolved")));
  return Response.json({ ok: true });
}
