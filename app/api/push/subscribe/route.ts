import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { PUBLIC_PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";
import { isLocale } from "@/i18n/config";

const Body = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
  }),
  topics: z.array(z.enum(PUBLIC_PUSH_TOPICS)).max(PUBLIC_PUSH_TOPICS.length),
  locale: z.string().optional(),
});

// Public on purpose: a visitor subscribes without an account. The only thing a
// caller can store is their own browser's push endpoint.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription." }, { status: 400 });

  // `staff` is never accepted from the request body — it comes from the session.
  const session = await getSession();
  const topics: PushTopic[] = [...new Set<PushTopic>([...parsed.data.topics, ...(session ? (["staff"] as const) : [])])];

  const { endpoint, keys } = parsed.data.subscription;
  const values = {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    topics,
    userId: session?.userId ?? null,
    locale: isLocale(parsed.data.locale) ? parsed.data.locale : "en",
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };

  await getDb()
    .insert(schema.pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });
  return Response.json({ ok: true, topics });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return Response.json({ error: "Missing endpoint." }, { status: 400 });
  await getDb().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, body.endpoint));
  return Response.json({ ok: true });
}
