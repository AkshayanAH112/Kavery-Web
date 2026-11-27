import { authorize } from "@/lib/auth/guard";
import { ownMedia } from "@/lib/content/server";
import { getDb, schema } from "@/lib/db";
import { nextRun } from "@/lib/push-schedule";
import { PASSED, ScheduleInput, scheduleError } from "@/lib/push-schedule-input";

/** Sets a notification to go out later, once or on a repeat. The Cron Trigger sends it. */
export async function POST(request: Request) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  const parsed = ScheduleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return scheduleError(parsed.error);
  const { topic, title, body, url, image: imageInput, rule } = parsed.data;

  const image = imageInput ? ownMedia(imageInput.url, imageInput.publicId, "notices") : null;
  if (imageInput && !image) return Response.json({ error: "That poster was not uploaded here. Choose it again." }, { status: 400 });
  const next = nextRun(rule);
  if (next === null) return PASSED();

  await getDb()
    .insert(schema.pushSchedules)
    .values({ topic, title, body: body || null, url: url || null, image: image?.url, imageKey: image?.key, ...rule, nextAt: new Date(next), createdBy: auth.session.userId });
  return Response.json({ ok: true, nextAt: next });
}
