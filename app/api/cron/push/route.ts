import { getEnv, getSecret } from "@/lib/db";
import { isPushConfigured } from "@/lib/push";
import { runDueSchedules } from "@/lib/push-schedules";

/**
 * Sends the scheduled notifications that are due. Called once a minute by the
 * Cron Trigger in worker.ts, which hands this request a one-time token through the
 * Worker env (an outside request cannot put anything there). A request with
 * `Authorization: Bearer <CRON_SECRET>` is also accepted, for running it by hand.
 */
export async function POST(request: Request) {
  const token = (getEnv() as unknown as Record<string, unknown>).CRON_RUN_TOKEN;
  const secret = getSecret("CRON_SECRET");
  const byTrigger = typeof token === "string" && token.length >= 32 && request.headers.get("x-cron-token") === token;
  const bySecret = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!byTrigger && !bySecret) return Response.json({ error: "Not allowed." }, { status: 403 });
  if (!isPushConfigured()) return Response.json({ skipped: "Push keys are not set." });
  return Response.json({ results: await runDueSchedules() });
}
