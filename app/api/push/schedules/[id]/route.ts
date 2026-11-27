import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { deleteMedia, ownMedia } from "@/lib/content/server";
import { getDb, schema } from "@/lib/db";
import { nextRun } from "@/lib/push-schedule";
import { NOT_FOUND, PASSED, ScheduleInput, scheduleError } from "@/lib/push-schedule-input";
import { finishWithPoster, ruleOf } from "@/lib/push-schedules";

const S = schema.pushSchedules;
const L = schema.pushLog;

async function find(id: string) {
  const [row] = await getDb().select().from(S).where(eq(S.id, id)).limit(1);
  return row ?? null;
}

const Action = z.object({ action: z.enum(["pause", "resume"]) });

/** Pause or resume (`{ action }`), or edit the whole schedule. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/push/schedules/[id]">) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  const row = await find((await params).id);
  if (!row) return NOT_FOUND();
  const json = await request.json().catch(() => null);
  const db = getDb();

  const action = Action.safeParse(json);
  if (action.success) {
    if (action.data.action === "pause") {
      await db.update(S).set({ status: "paused" }).where(eq(S.id, row.id));
      return Response.json({ ok: true });
    }
    const next = nextRun(ruleOf(row));
    if (next === null) return PASSED();
    await db.update(S).set({ status: "active", nextAt: new Date(next) }).where(eq(S.id, row.id));
    return Response.json({ ok: true, nextAt: next });
  }

  const parsed = ScheduleInput.safeParse(json);
  if (!parsed.success) return scheduleError(parsed.error);
  const { topic, title, body, url, image: imageInput, rule } = parsed.data;
  const image = imageInput ? ownMedia(imageInput.url, imageInput.publicId, "notices") : null;
  if (imageInput && !image) return Response.json({ error: "That poster was not uploaded here. Choose it again." }, { status: 400 });
  const next = nextRun(rule);
  if (next === null) return PASSED();

  // A schedule that has sent its poster shares a notice page with its later sends; keep that page in step.
  const [notice] = row.noticeId ? await db.select({ id: L.id, image: L.image, imageKey: L.imageKey }).from(L).where(eq(L.id, row.noticeId)).limit(1) : [];
  const pageIsUp = !!notice?.image;
  const oldKeys: (string | null)[] = [];
  let poster: { image?: string | null; imageKey?: string | null; noticeId?: string | null } = {};
  if (image) {
    if (row.imageKey) oldKeys.push(row.imageKey);
    if (pageIsUp) {
      oldKeys.push(notice.imageKey);
      await db.update(L).set({ image: image.url, imageKey: image.key }).where(eq(L.id, notice.id));
    } else poster = { image: image.url, imageKey: image.key, noticeId: null };
  }
  if (pageIsUp) await db.update(L).set({ title, body: body || null, url: url || null }).where(eq(L.id, notice.id));

  await db
    .update(S)
    .set({ topic, title, body: body || null, url: url || null, ...poster, ...rule, status: row.status === "paused" ? "paused" : "active", nextAt: new Date(next) })
    .where(eq(S.id, row.id));
  // The old poster is only removed once nothing points at it.
  await deleteMedia(oldKeys.filter((k) => k !== image?.key));
  return Response.json({ ok: true, nextAt: next });
}

/** Cancels it. Its earlier sends stay in the history, and a notice page it made stays up. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/push/schedules/[id]">) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  const row = await find((await params).id);
  if (!row) return NOT_FOUND();
  await finishWithPoster(row);
  return Response.json({ ok: true });
}
