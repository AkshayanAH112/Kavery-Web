import { authorize } from "@/lib/auth/guard";
import { listReminders } from "@/lib/keda/meetings";

const STATUSES = ["open", "contacted", "resolved", "all"] as const;

/** Families who missed two or more meetings in a row, with their contact details and the message to send. */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const asked = new URL(request.url).searchParams.get("status");
  const status = (STATUSES as readonly string[]).includes(asked ?? "") ? (asked as (typeof STATUSES)[number]) : "open";
  return Response.json({ reminders: await listReminders(status) });
}
