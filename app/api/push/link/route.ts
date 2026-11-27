import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { getParentChildren } from "@/lib/keda/parent";

const P = schema.pushSubscriptions;
const Body = z.object({ endpoint: z.string().url().max(1000) });

/**
 * Ties this phone's existing notification subscription to the children in its
 * signed parent cookie, so a reminder about a child reaches their family. Called
 * by the parent page when notifications are already on. The children come only
 * from the cookie; the request names nothing but its own push endpoint, which only
 * this browser knows.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing endpoint." }, { status: 400 });
  const children = (await getParentChildren()).map((s) => s.id);
  if (children.length === 0) return Response.json({ error: "Sign in with the student card first." }, { status: 401 });
  const updated = await getDb().update(P).set({ studentIds: children }).where(eq(P.endpoint, parsed.data.endpoint)).returning({ id: P.id });
  return Response.json({ linked: updated.length > 0 });
}

/** Signing out of the parent page: this phone stops getting reminders about those children. */
export async function DELETE(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing endpoint." }, { status: 400 });
  await getDb().update(P).set({ studentIds: [] }).where(eq(P.endpoint, parsed.data.endpoint));
  return Response.json({ ok: true });
}
