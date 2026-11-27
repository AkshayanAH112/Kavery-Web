import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { isPushConfigured } from "@/lib/push";
import { NOT_FOUND } from "@/lib/push-schedule-input";
import { deliverSchedule } from "@/lib/push-schedules";

/**
 * Sends a scheduled notification straight away. A one-off is then done and
 * removed; a repeat keeps its next time.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/push/schedules/[id]/send">) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  if (!isPushConfigured()) return Response.json({ error: "Push keys are not set on this deployment yet." }, { status: 503 });
  const S = schema.pushSchedules;
  const db = getDb();
  const [row] = await db.select().from(S).where(eq(S.id, (await params).id)).limit(1);
  if (!row) return NOT_FOUND();

  // A one-off is removed first, so the Cron Trigger cannot also send it in the same minute.
  if (row.repeat === "once") {
    const claimed = await db.delete(S).where(eq(S.id, row.id)).returning({ id: S.id });
    if (claimed.length === 0) return NOT_FOUND();
  }
  const result = await deliverSchedule(row, auth.session.userId);
  return Response.json({ ...result, logId: undefined });
}
