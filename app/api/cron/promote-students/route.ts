import { getSecret } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getLocalMonth } from "@/lib/dates";
import { promoteStudents } from "@/lib/keda/promotion";

/**
 * Yearly grade rollover. Called by a scheduled job with `Authorization: Bearer
 * <CRON_SECRET>`, or by a signed-in administrator. It only acts in January
 * (Sri Lanka time) and at most once per batch per year, so a retry or a second
 * call is harmless — see lib/keda/promotion.ts.
 *
 * An administrator (never the scheduled job) can send `{ "force": true }` to run
 * it in another month, for a year when the classes move up at a different time.
 * The once-per-year stamp still applies.
 */
export async function POST(request: Request) {
  const secret = getSecret("CRON_SECRET");
  const bearer = request.headers.get("authorization");
  const byCron = !!secret && bearer === `Bearer ${secret}`;
  if (!byCron) {
    const session = await getSession();
    if (!session) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!can(session.role, "staff.manage")) return Response.json({ error: "Your role does not allow this." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { force?: unknown } | null;
  const forced = !byCron && body?.force === true;
  if (getLocalMonth() !== 0 && !forced) return Response.json({ skipped: "Students are promoted in January only.", promotions: [] });
  return Response.json(await promoteStudents());
}
