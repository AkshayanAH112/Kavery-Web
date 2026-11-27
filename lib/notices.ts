import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PUBLIC_PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";

/**
 * A notice is a push notification that carried a poster. The notification itself
 * can only show a cropped picture (and an iPhone shows none), so tapping it opens
 * the notice page, where the poster is shown whole and can be zoomed and saved.
 *
 * Posters sent to the `staff` topic are notices too, but only a signed-in staff
 * member can open one; they never appear in the public list.
 */
const L = schema.pushLog;

export type Notice = { id: string; topic: PushTopic; title: string; body: string | null; image: string; link: string | null; sentAt: Date };

const columns = { id: L.id, topic: L.topic, title: L.title, body: L.body, image: L.image, url: L.url, createdAt: L.createdAt };

function toNotice(row: { id: string; topic: string; title: string; body: string | null; image: string | null; url: string | null; createdAt: Date }): Notice {
  return { id: row.id, topic: row.topic as PushTopic, title: row.title, body: row.body, image: row.image!, link: row.url, sentAt: row.createdAt };
}

/** The page a notification with a poster opens. `{locale}` is filled in per subscriber by `sendPushToTopic`. */
export const noticePath = (id: string, locale = "{locale}") => `/${locale}/notices/${id}`;

export async function getNotice(id: string): Promise<Notice | null> {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const [row] = await getDb().select(columns).from(L).where(and(eq(L.id, id), isNotNull(L.image))).limit(1);
  if (!row) return null;
  if (row.topic === "staff" && !(await getSession())) return null;
  return toNotice(row);
}

/** Most recent public notices first, optionally for some topics only. */
export async function recentNotices({ topics = PUBLIC_PUSH_TOPICS, limit = 24, except }: { topics?: readonly PushTopic[]; limit?: number; except?: string } = {}): Promise<Notice[]> {
  const publicTopics = topics.filter((t) => t !== "staff");
  if (publicTopics.length === 0) return [];
  const rows = await getDb()
    .select(columns)
    .from(L)
    .where(and(isNotNull(L.image), inArray(L.topic, publicTopics), except ? ne(L.id, except) : undefined))
    .orderBy(desc(L.createdAt))
    .limit(limit);
  return rows.map(toNotice);
}
