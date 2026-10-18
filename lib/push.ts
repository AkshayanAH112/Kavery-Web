import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { desc, inArray } from "drizzle-orm";
import { getDb, getSecret, schema } from "@/lib/db";
import { PUSH_TOPICS, type PushTopic } from "./push-topics";

export function isPushConfigured() {
  return !!(getSecret("VAPID_PUBLIC_KEY") && getSecret("VAPID_PRIVATE_KEY") && getSecret("VAPID_SUBJECT"));
}

/** Subscriber counts per topic and the most recent sends, for the console page. */
export async function getPushOverview() {
  const db = getDb();
  const [subs, log] = await Promise.all([
    db.select({ topics: schema.pushSubscriptions.topics }).from(schema.pushSubscriptions),
    db.select().from(schema.pushLog).orderBy(desc(schema.pushLog.createdAt)).limit(15),
  ]);
  return {
    configured: isPushConfigured(),
    total: subs.length,
    counts: Object.fromEntries(PUSH_TOPICS.map((t) => [t, subs.filter((s) => s.topics.includes(t)).length])) as Record<PushTopic, number>,
    log: log.map((entry) => ({ id: entry.id, topic: entry.topic, title: entry.title, delivered: entry.delivered, failed: entry.failed, createdAt: entry.createdAt.getTime() })),
  };
}
export type PushOverview = Awaited<ReturnType<typeof getPushOverview>>;

export type PushContent = { title: string; body?: string; url?: string; tag?: string };

/**
 * Each delivery is a subrequest to the browser vendor's push service. The Worker
 * is on the Paid plan, whose subrequest cap is far above this, but a Worker keeps
 * only six connections open at once and a background send (`waitUntil`) must
 * finish within 30 seconds — so one call sends to at most LIMIT subscriptions
 * and reports how many were left over. Past a few hundred subscribers, move the
 * fan-out to a Cloudflare Queue.
 */
const LIMIT = 300;

export async function sendPushToTopic(topic: PushTopic, content: PushContent) {
  if (!isPushConfigured()) return { delivered: 0, failed: 0, skipped: 0, configured: false };
  const db = getDb();
  const all = await db.select().from(schema.pushSubscriptions);
  const targets = all.filter((s) => s.topics.includes(topic));
  const batch = targets.slice(0, LIMIT);

  const vapid = {
    subject: getSecret("VAPID_SUBJECT")!,
    publicKey: getSecret("VAPID_PUBLIC_KEY")!,
    privateKey: getSecret("VAPID_PRIVATE_KEY")!,
  };

  const gone: string[] = [];
  const ok: string[] = [];
  let failed = 0;

  await Promise.all(
    batch.map(async (sub) => {
      try {
        const request = await buildPushPayload(
          // "{locale}" in a link becomes the language this subscriber reads the site in.
          { data: { ...content, ...(content.url ? { url: content.url.replace("{locale}", sub.locale === "ta" ? "ta" : "en") } : {}), topic }, options: { ttl: 60 * 60 * 12, urgency: "normal" } },
          { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          vapid,
        );
        const res = await fetch(sub.endpoint, request);
        // 404/410 mean the browser dropped the subscription — it will never work again.
        if (res.status === 404 || res.status === 410) gone.push(sub.id);
        else if (res.ok) ok.push(sub.id);
        else failed++;
      } catch {
        failed++;
      }
    }),
  );

  if (gone.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone));
  if (ok.length) await db.update(schema.pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(schema.pushSubscriptions.id, ok));

  return { delivered: ok.length, failed: failed + gone.length, skipped: targets.length - batch.length, configured: true };
}

/**
 * Sends without making the caller wait: the request that triggered it has
 * already done its real work, and a failed push must never fail that.
 */
export function pushInBackground(topic: PushTopic, content: PushContent) {
  const push = sendPushToTopic(topic, content).catch(() => {});
  const ctx = getCloudflareContext().ctx;
  if (ctx?.waitUntil) ctx.waitUntil(push);
}
