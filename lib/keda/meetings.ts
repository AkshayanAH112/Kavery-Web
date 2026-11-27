/**
 * Parent meetings: who is expected, marking a parent by the child's card, ending
 * the meeting, and the "missed two in a row" reminders.
 *
 * Every attendance row is one child's family. A parent with two children at the
 * same meeting is marked for both by one scan: brothers and sisters are found by
 * the guardian phone they were registered with.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getDayRange } from "@/lib/dates";
import { sendPushToFamilies } from "@/lib/push";
import { REMINDER_TITLE, reminderText, type NextMeeting } from "@/lib/keda/meeting-text";
import type { StudentRow } from "@/lib/keda/server";
import { normalizePhone } from "@/lib/membership/rules";

const { parentMeetings: M, meetingAttendance: A, meetingReminders: R, students: S, batches: B } = schema;
export type MeetingRow = typeof M.$inferSelect;
export type ReminderRow = typeof R.$inferSelect;

/**
 * D1 takes at most 100 bound values per statement, so lists of ids and multi-row
 * inserts go in pieces: 40 ids, or 10 attendance rows of 7 values each.
 */
const ID_CHUNK = 40;
function chunks<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** More children than this on one guardian phone is not one family (a shared or placeholder number), so a scan marks only its own child. */
export const MAX_SIBLINGS = 3;

export async function getMeeting(id: unknown) {
  if (typeof id !== "string") return null;
  const [row] = await getDb().select().from(M).where(eq(M.id, id)).limit(1);
  return row ?? null;
}

/** Whether a student is one of the families a meeting is for. */
export function isExpected(meeting: MeetingRow, student: StudentRow) {
  if (!student.isActive) return false;
  if (meeting.batchId && student.batchId !== meeting.batchId) return false;
  if (meeting.grade && student.grade !== meeting.grade) return false;
  // A child registered after the meeting's day was not part of it.
  if (student.registrationDate && student.registrationDate >= getDayRange(meeting.date).end) return false;
  return true;
}

/** The families a meeting is for: active students of its batch and grade, registered by its day. */
export async function expectedStudents(meeting: MeetingRow) {
  const rows = await getDb()
    .select()
    .from(S)
    .where(and(eq(S.isActive, true), meeting.batchId ? eq(S.batchId, meeting.batchId) : undefined, meeting.grade ? eq(S.grade, meeting.grade) : undefined))
    .orderBy(asc(S.grade), asc(S.name));
  return rows.filter((s) => isExpected(meeting, s));
}

/** Every family on the register — the expected ones, plus anyone already marked who has since moved batch. */
export async function meetingRegister(meeting: MeetingRow) {
  const db = getDb();
  const [expected, marks] = await Promise.all([expectedStudents(meeting), db.select().from(A).where(eq(A.meetingId, meeting.id))]);
  const extraIds = marks.map((m) => m.studentId).filter((id) => !expected.some((s) => s.id === id));
  const extra = (await Promise.all(chunks(extraIds, ID_CHUNK).map((ids) => db.select().from(S).where(inArray(S.id, ids))))).flat();
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  return [...expected, ...extra].map((student) => {
    const mark = byStudent.get(student.id);
    return { student, status: mark ? (mark.present ? ("present" as const) : ("absent" as const)) : ("unmarked" as const), markedAt: mark?.updatedAt ?? null };
  });
}

/** Counts for the meetings list, in one query per table. */
export async function meetingCounts(meetings: MeetingRow[]) {
  if (meetings.length === 0) return new Map<string, { present: number; absent: number }>();
  const ids = meetings.map((m) => m.id);
  const rows = (await Promise.all(chunks(ids, ID_CHUNK).map((part) => getDb().select({ meetingId: A.meetingId, present: A.present }).from(A).where(inArray(A.meetingId, part))))).flat();
  const counts = new Map(meetings.map((m) => [m.id, { present: 0, absent: 0 }]));
  for (const r of rows) {
    const c = counts.get(r.meetingId)!;
    if (r.present) c.present++;
    else c.absent++;
  }
  return counts;
}

/**
 * Marks one family. Re-checks the reminders when the meeting has already ended,
 * so correcting a mark afterwards takes back a reminder it caused (or raises one).
 */
export async function markParent(meeting: MeetingRow, studentIds: string[], present: boolean, userId: string) {
  const db = getDb();
  for (const studentId of studentIds) {
    await db
      .insert(A)
      .values({ meetingId: meeting.id, studentId, present, markedBy: userId })
      .onConflictDoUpdate({ target: [A.meetingId, A.studentId], set: { present, markedBy: userId, updatedAt: new Date() } });
  }
  if (meeting.endedAt) await checkReminders(studentIds);
}

/** The scanned child's brothers and sisters at the same meeting: the same guardian phone, also expected. */
export async function siblingsAt(meeting: MeetingRow, student: StudentRow): Promise<{ siblings: StudentRow[]; shared: number }> {
  const phone = normalizePhone(student.guardianPhone ?? "");
  if (phone.length < 7) return { siblings: [], shared: 0 };
  const sameFamily = await getDb()
    .select()
    .from(S)
    .where(and(eq(S.isActive, true), ne(S.id, student.id), or(eq(S.guardianPhone, student.guardianPhone), eq(S.guardianPhone, phone))));
  const family = sameFamily.filter((s) => normalizePhone(s.guardianPhone) === phone);
  if (family.length > MAX_SIBLINGS) return { siblings: [], shared: family.length };
  return { siblings: family.filter((s) => isExpected(meeting, s)), shared: 0 };
}

/**
 * Closes the register: every expected family not scanned is marked absent, then
 * each of them is checked for a run of missed meetings. Ending twice is harmless.
 */
export async function endMeeting(meeting: MeetingRow, userId: string) {
  const db = getDb();
  const expected = await expectedStudents(meeting);
  const marked = new Set((await db.select({ studentId: A.studentId }).from(A).where(eq(A.meetingId, meeting.id))).map((r) => r.studentId));
  const missing = expected.filter((s) => !marked.has(s.id));
  for (const part of chunks(missing, 10)) {
    await db
      .insert(A)
      .values(part.map((s) => ({ meetingId: meeting.id, studentId: s.id, present: false, markedBy: userId })))
      .onConflictDoNothing();
  }
  if (!meeting.endedAt) await db.update(M).set({ endedAt: new Date(), endedBy: userId }).where(eq(M.id, meeting.id));
  const raised = await checkReminders(expected.map((s) => s.id));
  return { markedAbsent: missing.length, reminders: raised };
}

/**
 * Brings each student's reminders in line with their ended meetings, newest first:
 *  - every meeting that ends a run of two or more absences should have a reminder
 *    (only the newest is created here; older runs were raised when they happened);
 *  - a reminder whose run no longer exists (a mark was corrected) is removed;
 *  - when the newest meeting was attended, open reminders are resolved.
 * New reminders are pushed to the family's phones. Returns how many were raised.
 */
export async function checkReminders(studentIds: string[]) {
  if (studentIds.length === 0) return 0;
  const db = getDb();
  const history = (
    await Promise.all(
      chunks(studentIds, ID_CHUNK).map((ids) =>
        db
          .select({ studentId: A.studentId, meetingId: A.meetingId, present: A.present, date: M.date, createdAt: M.createdAt })
          .from(A)
          .innerJoin(M, eq(M.id, A.meetingId))
          .where(and(inArray(A.studentId, ids), isNotNull(M.endedAt))),
      ),
    )
  )
    .flat()
    .sort((x, y) => y.date.getTime() - x.date.getTime() || y.createdAt.getTime() - x.createdAt.getTime());

  const created: { studentId: string; missed: number }[] = [];
  for (const studentId of studentIds) {
    const rows = history.filter((h) => h.studentId === studentId);
    // A meeting ends a run when it and the one before it were both missed.
    const runEnds = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      let run = 0;
      while (i + run < rows.length && !rows[i + run].present) run++;
      if (run >= 2) runEnds.set(rows[i].meetingId, run);
    }
    await db.delete(R).where(and(eq(R.studentId, studentId), runEnds.size ? notInArray(R.meetingId, [...runEnds.keys()]) : undefined));

    const latest = rows[0];
    if (!latest) continue;
    if (latest.present) {
      await db.update(R).set({ status: "resolved" }).where(and(eq(R.studentId, studentId), ne(R.status, "resolved")));
      continue;
    }
    const missed = runEnds.get(latest.meetingId);
    if (!missed) continue;
    const inserted = await db.insert(R).values({ studentId, meetingId: latest.meetingId, missed }).onConflictDoNothing().returning({ id: R.id });
    if (inserted.length) created.push({ studentId, missed });
  }

  if (created.length) {
    const push = pushReminders(created).catch((error) => console.error("meeting reminder push failed", error));
    const ctx = getCloudflareContext().ctx;
    if (ctx?.waitUntil) ctx.waitUntil(push);
    else await push;
  }
  return created.length;
}

/** The next meeting a student's family is expected at, if one is set. */
export async function nextMeetingFor(student: StudentRow, upcoming?: MeetingRow[]): Promise<NextMeeting | null> {
  const list = upcoming ?? (await upcomingMeetings());
  const next = list.find((m) => isExpected(m, student));
  return next ? { date: next.date.toISOString(), time: next.time, venue: next.venue } : null;
}

/** Meetings from today on that are not over yet, soonest first. */
export async function upcomingMeetings() {
  return getDb()
    .select()
    .from(M)
    .where(and(isNull(M.endedAt), gte(M.date, getDayRange().start)))
    .orderBy(asc(M.date), asc(M.time));
}

async function pushReminders(list: { studentId: string; missed: number }[]) {
  const db = getDb();
  const students = (await Promise.all(chunks(list.map((l) => l.studentId), ID_CHUNK).map((ids) => db.select().from(S).where(inArray(S.id, ids))))).flat();
  const upcoming = await upcomingMeetings();
  for (const { studentId, missed } of list) {
    const student = students.find((s) => s.id === studentId);
    if (!student) continue;
    const text = reminderText({ name: student.name, missed, next: await nextMeetingFor(student, upcoming) });
    const result = await sendPushToFamilies([studentId], { title: REMINDER_TITLE, body: `${text.ta}\n${text.en}`, url: "/{locale}/parents", tag: `meeting-reminder-${studentId}` });
    if (result.delivered > 0) await db.update(R).set({ pushedAt: new Date() }).where(and(eq(R.studentId, studentId), eq(R.status, "open")));
  }
}

/**
 * Reminders for staff to follow up, with what they need to reach the family. One
 * per family: the latest run they are in (a family that missed three shows once,
 * as three), and its status is the family's status.
 */
export async function listReminders(status: "open" | "contacted" | "resolved" | "all" = "open") {
  const db = getDb();
  const all = await db
    .select({ reminder: R, student: S, meeting: M, batchName: B.name })
    .from(R)
    .innerJoin(S, eq(S.id, R.studentId))
    .innerJoin(M, eq(M.id, R.meetingId))
    .leftJoin(B, eq(B.id, S.batchId))
    .where(status === "resolved" ? eq(R.status, "resolved") : status === "all" ? undefined : ne(R.status, "resolved"))
    .orderBy(desc(M.date), desc(R.createdAt))
    .limit(600);
  const seen = new Set<string>();
  const rows = all.filter((r) => !seen.has(r.student.id) && seen.add(r.student.id) && (status === "all" || r.reminder.status === status)).slice(0, 300);
  const upcoming = await upcomingMeetings();
  // The meetings each family missed in this run, for staff to see the dates.
  const ids = [...new Set(rows.map((r) => r.student.id))];
  const history = (
    await Promise.all(
      chunks(ids, ID_CHUNK).map((part) =>
        db
          .select({ studentId: A.studentId, present: A.present, date: M.date, title: M.title, meetingId: M.id })
          .from(A)
          .innerJoin(M, eq(M.id, A.meetingId))
          .where(and(inArray(A.studentId, part), isNotNull(M.endedAt))),
      ),
    )
  )
    .flat()
    .sort((x, y) => y.date.getTime() - x.date.getTime());
  return Promise.all(
    rows.map(async ({ reminder, student, meeting, batchName }) => {
      const mine = history.filter((h) => h.studentId === student.id);
      const from = mine.findIndex((h) => h.meetingId === meeting.id);
      const missedMeetings = mine.slice(from, from + reminder.missed).map((h) => ({ title: h.title, date: h.date.toISOString() }));
      const next = await nextMeetingFor(student, upcoming);
      return {
        id: reminder.id,
        status: reminder.status as "open" | "contacted" | "resolved",
        missed: reminder.missed,
        createdAt: reminder.createdAt.getTime(),
        pushedAt: reminder.pushedAt?.getTime() ?? null,
        contactedAt: reminder.contactedAt?.getTime() ?? null,
        student: { id: student.id, name: student.name, grade: student.grade, registrationNumber: student.registrationNumber, batchName, guardianName: student.guardianName, guardianPhone: student.guardianPhone, whatsapp: student.whatsapp },
        missedMeetings,
        next,
        text: reminderText({ name: student.name, missed: reminder.missed, next }),
      };
    }),
  );
}
export type ReminderItem = Awaited<ReturnType<typeof listReminders>>[number];

/** For the parent page: this child's meetings, the next one, and an open reminder in both languages. */
export async function meetingsForParent(student: StudentRow) {
  const db = getDb();
  const [rows, open, next] = await Promise.all([
    db
      .select({ present: A.present, date: M.date, title: M.title })
      .from(A)
      .innerJoin(M, eq(M.id, A.meetingId))
      .where(and(eq(A.studentId, student.id), isNotNull(M.endedAt)))
      .orderBy(desc(M.date))
      .limit(12),
    db
      .select()
      .from(R)
      .where(and(eq(R.studentId, student.id), ne(R.status, "resolved")))
      .orderBy(desc(R.createdAt))
      .limit(1),
    nextMeetingFor(student),
  ]);
  return {
    attended: rows.filter((r) => r.present).length,
    total: rows.length,
    recent: rows.slice(0, 6).map((r) => ({ title: r.title, date: r.date.toISOString(), present: r.present })),
    next,
    reminder: open[0] ? { missed: open[0].missed, text: reminderText({ name: student.name, missed: open[0].missed, next }) } : null,
  };
}
