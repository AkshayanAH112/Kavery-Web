import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, getSecret, schema } from "@/lib/db";
import { noticePath } from "./notices";
import { PUSH_TOPICS, type PushTopic } from "./push-topics";

export function isPushConfigured() {
  return !!(getSecret("VAPID_PUBLIC_KEY") && getSecret("VAPID_PRIVATE_KEY") && getSecret("VAPID_SUBJECT"));
}

/** Subscriber counts per topic and the most recent sends, for the console page. */
export async function getPushOverview() {
  const db = getDb();
  const L = schema.pushLog;
  const [subs, log, notices] = await Promise.all([
    db.select({ topics: schema.pushSubscriptions.topics }).from(schema.pushSubscriptions),
    db.select().from(L).orderBy(desc(L.createdAt)).limit(15),
    // Every notice page that is still up, for editing and deleting.
    db
      .select({ id: L.id, topic: L.topic, title: L.title, body: L.body, url: L.url, image: L.image, createdAt: L.createdAt })
      .from(L)
      .where(isNotNull(L.image))
      .orderBy(desc(L.createdAt))
      .limit(200),
  ]);
  return {
    configured: isPushConfigured(),
    total: subs.length,
    counts: Object.fromEntries(PUSH_TOPICS.map((t) => [t, subs.filter((s) => s.topics.includes(t)).length])) as Record<PushTopic, number>,
    log: log.map((entry) => ({ id: entry.id, topic: entry.topic, title: entry.title, image: entry.image, delivered: entry.delivered, failed: entry.failed, createdAt: entry.createdAt.getTime() })),
    notices: notices.map((n) => ({ id: n.id, topic: n.topic, title: n.title, body: n.body ?? "", url: n.url ?? "", image: n.image!, createdAt: n.createdAt.getTime() })),
  };
}
export type PushOverview = Awaited<ReturnType<typeof getPushOverview>>;

/** `image` is a same-site poster address; Android and desktop browsers show it large in the notification. */
export type PushContent = { title: string; body?: string; url?: string; tag?: string; image?: string };

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
  const all = await getDb().select().from(schema.pushSubscriptions);
  return deliver(
    all.filter((s) => s.topics.includes(topic)),
    content,
    topic,
  );
}

/**
 * To the phones of the families of these KEDA students only: the devices on which
 * a parent signed in to the parent page with that child's card turned on
 * notifications. Nobody else's device receives it, whatever topics they follow.
 */
export async function sendPushToFamilies(studentIds: string[], content: PushContent) {
  // Called with one family at a time; D1 takes at most 100 bound values per statement.
  studentIds = studentIds.slice(0, 50);
  if (!isPushConfigured() || studentIds.length === 0) return { delivered: 0, failed: 0, skipped: 0, configured: isPushConfigured() };
  const P = schema.pushSubscriptions;
  const targets = await getDb()
    .select()
    .from(P)
    .where(sql`exists (select 1 from json_each(${P.studentIds}) where json_each.value in ${studentIds})`);
  return deliver(targets, content, "keda");
}

async function deliver(targets: (typeof schema.pushSubscriptions.$inferSelect)[], content: PushContent, topic: PushTopic) {
  const db = getDb();
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

  // In pieces of 50: D1 takes at most 100 bound values per statement.
  for (let i = 0; i < gone.length; i += 50) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone.slice(i, i + 50)));
  for (let i = 0; i < ok.length; i += 50) await db.update(schema.pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(schema.pushSubscriptions.id, ok.slice(i, i + 50)));

  return { delivered: ok.length, failed: failed + gone.length, skipped: targets.length - batch.length, configured: true };
}

/**
 * One send as the console makes it: the history row first (a notification with a
 * poster opens that row's notice page), then the delivery, then the counts.
 * `poster` passes ownership of the uploaded file to the new notice page;
 * `noticeId` instead reuses an existing page, as a repeating schedule does.
 */
export async function sendAndLog(input: {
  topic: PushTopic;
  title: string;
  body?: string | null;
  url?: string | null;
  poster?: { url: string; key: string } | null;
  notice?: { id: string; image: string } | null;
  sentBy?: string | null;
}) {
  const { topic, title, poster, notice } = input;
  const body = input.body || undefined;
  const url = input.url || undefined;
  const db = getDb();
  const [entry] = await db
    .insert(schema.pushLog)
    .values({ topic, title, body, url, image: poster?.url, imageKey: poster?.key, sentBy: input.sentBy ?? null })
    .returning({ id: schema.pushLog.id });

  const page = poster ? { id: entry.id, image: poster.url } : notice;
  const result = await sendPushToTopic(
    topic,
    // The notice page carries the staff link as its "More details" button.
    page ? { title, body, url: noticePath(page.id), image: page.image, tag: `notice-${page.id}` } : { title, body, url },
  );
  await db.update(schema.pushLog).set({ delivered: result.delivered, failed: result.failed }).where(eq(schema.pushLog.id, entry.id));
  return { ...result, logId: entry.id, notice: page ? noticePath(page.id, "en") : null };
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
