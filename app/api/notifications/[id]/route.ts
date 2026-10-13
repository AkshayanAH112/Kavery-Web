import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { alertDoc, isId, readBody } from "@/lib/keda/server";

const L = schema.leaveAlerts;
const STATUSES = ["pending", "acknowledged", "resolved"];

export async function PATCH(request: Request, { params }: RouteContext<"/api/notifications/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const data = await readBody(request);
  if (!STATUSES.includes(data?.status)) return Response.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });

  const [updated] = isId(id) ? await getDb().update(L).set({ status: data!.status }).where(eq(L.id, id)).returning() : [];
  if (!updated) return Response.json({ error: "Notification not found" }, { status: 404 });
  return Response.json({ notification: alertDoc(updated) });
}
