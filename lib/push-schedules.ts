import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { deleteMedia } from "@/lib/content/server";
import { getPushOverview, sendAndLog } from "@/lib/push";
import { LATE_LIMIT_MS, nextRun, type ScheduleRule } from "@/lib/push-schedule";
import type { PushTopic } from "@/lib/push-topics";

const S = schema.pushSchedules;
const L = schema.pushLog;
export type ScheduleRow = typeof S.$inferSelect;

export const ruleOf = (row: ScheduleRow): ScheduleRule => ({
  repeat: row.repeat as ScheduleRule["repeat"],
  startDate: row.startDate,
  time: row.time,
  days: row.days,
  dayOfMonth: row.dayOfMonth,
  endDate: row.endDate,
});

/** The poster page a repeating schedule reuses, while it is still up. */
async function liveNotice(id: string | null) {
  if (!id) return null;
  const [row] = await getDb()
    .select({ id: L.id, image: L.image })
    .from(L)
    .where(and(eq(L.id, id), isNotNull(L.image)))
    .limit(1);
  return row?.image ? { id: row.id, image: row.image } : null;
}

/**
 * Sends one schedule now. The first send with a poster creates its notice page and
 * hands the file to it; later sends reuse that page (if someone deleted it, they go
 * as text only). Does not move `next_at` — the caller does.
 */
export async function deliverSchedule(row: ScheduleRow, sentBy?: string | null) {
  const db = getDb();
  const poster = row.image && row.imageKey ? { url: row.image, key: row.imageKey } : null;
  const notice = poster ? null : await liveNotice(row.noticeId);
  const result = await sendAndLog({ topic: row.topic as PushTopic, title: row.title, body: row.body, url: row.url, poster, notice, sentBy: sentBy ?? row.createdBy });
  await db
    .update(S)
    .set({
      lastSentAt: new Date(),
      lastDelivered: result.delivered,
      sends: row.sends + 1,
      ...(poster ? { image: null, imageKey: null, noticeId: result.logId } : {}),
    })
    .where(eq(S.id, row.id));
  return result;
}

/** A schedule with nothing left to send is removed; its sends stay in the history. */
async function finish(row: ScheduleRow) {
  await getDb().delete(S).where(eq(S.id, row.id));
}

/**
 * Called once a minute by the Cron Trigger. Each due row is claimed by moving its
 * `next_at` on in the same statement that checks it, so two overlapping runs can
 * never send the same notification twice.
 */
export async function runDueSchedules(now = Date.now()) {
  const db = getDb();
  const due = await db
    .select()
    .from(S)
    .where(and(eq(S.status, "active"), lte(S.nextAt, new Date(now))))
    .limit(20);

  const report: { id: string; title: string; outcome: "sent" | "missed" | "skipped"; delivered?: number }[] = [];
  for (const row of due) {
    const dueAt = row.nextAt!.getTime();
    const next = nextRun(ruleOf(row), now);
    const late = now - dueAt > LATE_LIMIT_MS;
    const claimed = await db
      .update(S)
      .set(late && row.repeat === "once" ? { status: "missed", nextAt: null, lastMissedAt: new Date(dueAt) } : { nextAt: next ? new Date(next) : null, ...(late ? { lastMissedAt: new Date(dueAt) } : {}) })
      .where(and(eq(S.id, row.id), eq(S.status, "active"), eq(S.nextAt, row.nextAt!)))
      .returning({ id: S.id });
    if (claimed.length === 0) {
      report.push({ id: row.id, title: row.title, outcome: "skipped" });
      continue;
    }
    if (late) {
      report.push({ id: row.id, title: row.title, outcome: "missed" });
      if (row.repeat !== "once" && next === null) await finishWithPoster(row);
      continue;
    }
    try {
      const result = await deliverSchedule(row);
      report.push({ id: row.id, title: row.title, outcome: "sent", delivered: result.delivered });
      if (next === null) await finish(row);
    } catch (error) {
      // Not retried: if the push went out before the error, a retry would send it twice.
      // A one-off is kept as "missed" so staff see it and can send it by hand.
      console.error("scheduled push failed", row.id, error);
      report.push({ id: row.id, title: row.title, outcome: "missed" });
      await db
        .update(S)
        .set({ lastMissedAt: new Date(dueAt), ...(next === null ? { status: "missed" } : {}) })
        .where(eq(S.id, row.id));
    }
  }
  return report;
}

/** Removes a schedule and a poster it still owns (one never sent). */
export async function finishWithPoster(row: ScheduleRow) {
  await finish(row);
  await deleteMedia([row.imageKey]);
}

const STATUS_ORDER = { missed: 0, active: 1, paused: 2 } as const;

/** Every schedule for the console, with the poster to show beside it. */
export async function listSchedules() {
  const db = getDb();
  const rows = await db.select().from(S).limit(90);
  const noticeIds = rows.map((r) => r.noticeId).filter((id): id is string => !!id);
  const notices = noticeIds.length ? await db.select({ id: L.id, image: L.image }).from(L).where(inArray(L.id, noticeIds)) : [];
  const images = new Map(notices.map((n) => [n.id, n.image]));
  return rows
    .map((r) => ({
      id: r.id,
      topic: r.topic,
      title: r.title,
      body: r.body ?? "",
      url: r.url ?? "",
      // The poster it will send: its own until the first send, then its notice page's.
      image: r.image ?? (r.noticeId ? (images.get(r.noticeId) ?? null) : null),
      noticeId: r.noticeId && images.get(r.noticeId) ? r.noticeId : null,
      ...ruleOf(r),
      status: r.status as "active" | "paused" | "missed",
      nextAt: r.nextAt?.getTime() ?? null,
      lastSentAt: r.lastSentAt?.getTime() ?? null,
      lastDelivered: r.lastDelivered,
      lastMissedAt: r.lastMissedAt?.getTime() ?? null,
      sends: r.sends,
    }))
    // Missed ones first (they need someone), then the next to go out, then paused.
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity));
}
export type ScheduleItem = Awaited<ReturnType<typeof listSchedules>>[number];

/** Everything the Notifications console page shows. */
export async function getPushConsole() {
  const [overview, schedules] = await Promise.all([getPushOverview(), listSchedules()]);
  return { ...overview, schedules };
}
export type PushConsole = Awaited<ReturnType<typeof getPushConsole>>;
