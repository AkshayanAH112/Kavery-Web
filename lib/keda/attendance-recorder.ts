import { and, asc, between, eq, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/lib/db";
import { sendPushToFamilies, sendPushToTopic } from "@/lib/push";
import { ABSENCE_LOCK_TITLE, absenceLockText } from "@/lib/keda/absence-lock-text";

const { attendance: A, students: S, classSessions: C, leaveAlerts: L } = schema;

/** How many classes missed in a row deactivate a student until an administrator reactivates them. */
export const ABSENCE_LOCK_RUN = 2;

/**
 * THE one place an attendance row is written. It flips `present`, moves
 * `countedAsLeave`, keeps the student's leave counters in step, raises the
 * 2-leave and 3-leave alerts, and deactivates a student who has missed two
 * classes in a row. Both callers — marking one student and closing a register —
 * go through here. Never write an attendance row from anywhere else: the two
 * paths would drift and `totalLeaves` would stop matching the rows.
 *
 * The counter change is a pure function of the transition (was this row already
 * counted as a leave → is it now), so toggling a student back and forth, or
 * closing a register twice, never double-counts.
 *
 * Three states, not two: no row = "not marked"; present = false = "marked
 * absent" and counted as a leave. Only this function creates the second.
 */
export async function recordAttendance(opts: { studentId: string; classId: string; present: boolean; remarks?: string; markedBy?: string }) {
  const { studentId, classId, remarks, markedBy } = opts;
  const db = getDb();

  const [prior, session] = await Promise.all([
    db.query.attendance.findFirst({ where: and(eq(A.studentId, studentId), eq(A.classId, classId)) }),
    db.query.classSessions.findFirst({ where: eq(C.id, classId) }),
  ]);

  const wasCounted = prior?.countedAsLeave ?? false;
  const present = opts.present !== false;
  const nowCounted = !present;
  // A leave is dated by its class, not by when the register happened to be closed.
  const date = session?.date ?? new Date();

  const values = { present, date, countedAsLeave: nowCounted, ...(remarks !== undefined ? { remarks } : {}), ...(markedBy ? { markedBy } : {}) };
  const [attendance] = await db
    .insert(A)
    .values({ studentId, classId, ...values })
    .onConflictDoUpdate({ target: [A.studentId, A.classId], set: values })
    .returning();

  const delta = (nowCounted ? 1 : 0) - (wasCounted ? 1 : 0);
  let student = await db.query.students.findFirst({ where: eq(S.id, studentId) });
  let locked = false;

  if (delta !== 0 && student) {
    // totalLeaves is a lifetime counter; currentLeaveCycle resets on reactivation and promotion.
    [student] = await db
      .update(S)
      .set({ totalLeaves: sql`max(0, ${S.totalLeaves} + ${delta})`, currentLeaveCycle: sql`max(0, ${S.currentLeaveCycle} + ${delta})` })
      .where(eq(S.id, studentId))
      .returning();

    if (delta === 1) {
      // Stamped once: which leave of the cycle this was, and which cycle. A later correction does not rewrite it.
      await db.update(A).set({ leaveCycleAtRecord: student.currentLeaveCycle, leaveGeneration: student.cycleGeneration }).where(eq(A.id, attendance.id));
      attendance.leaveCycleAtRecord = student.currentLeaveCycle;
      attendance.leaveGeneration = student.cycleGeneration;

      let critical = false;
      if (student.currentLeaveCycle === 2 || student.currentLeaveCycle === 3) {
        const leaves = await db
          .select({ date: A.date })
          .from(A)
          .where(and(eq(A.studentId, studentId), eq(A.countedAsLeave, true), between(A.leaveCycleAtRecord, 1, student.currentLeaveCycle)))
          .orderBy(asc(A.date));
        const type = student.currentLeaveCycle === 2 ? "parent_warning" : "admin_critical";

        // Unique per (student, type, cycleGeneration): the same warning cannot fire twice in one
        // cycle, but does fire again after a reactivation or promotion starts a new one.
        const created = await db
          .insert(L)
          .values({
            studentId,
            type,
            cycleGeneration: student.cycleGeneration,
            registrationNumber: student.registrationNumber,
            studentName: student.name,
            leaveCount: student.currentLeaveCycle,
            leaveDates: leaves.map((l) => l.date.getTime()),
          })
          .onConflictDoNothing()
          .returning({ id: L.id });
        critical = created.length > 0 && type === "admin_critical";
      }

      if (student.isActive) {
        const run = await absenceRun(student, classId);
        if (run) {
          // Conditional on still being active, so two requests racing on one student lock (and push) once.
          const [deactivated] = await db
            .update(S)
            .set({ isActive: false })
            .where(and(eq(S.id, studentId), eq(S.isActive, true)))
            .returning();
          if (deactivated) {
            student = deactivated;
            locked = true;
            await db
              .insert(L)
              .values({
                studentId,
                type: "absence_lock",
                cycleGeneration: student.cycleGeneration,
                registrationNumber: student.registrationNumber,
                studentName: student.name,
                leaveCount: run.length,
                leaveDates: run.map((d) => d.getTime()),
              })
              .onConflictDoNothing();
          }
        }
      }

      // One staff push per leave: the lock says more than the 3-leave escalation, so it wins.
      if (locked) {
        inBackground(
          sendPushToTopic("staff", {
            title: `${student.name} missed ${ABSENCE_LOCK_RUN} classes in a row and is locked`,
            body: [student.registrationNumber, "Reactivate them from Alerts to let them be scanned again."].filter(Boolean).join(" · "),
            url: "/console/alerts?type=absence_lock",
            tag: `leave-${studentId}`,
          }),
        );
        const text = absenceLockText(student.name);
        // The parent page no longer shows a deactivated child, so the link is the club's contact details.
        inBackground(sendPushToFamilies([studentId], { title: ABSENCE_LOCK_TITLE, body: `${text.ta}\n${text.en}`, url: "/{locale}/about", tag: `absence-lock-${studentId}` }));
      } else if (critical) {
        inBackground(sendPushToTopic("staff", { title: `${student.name} has reached 3 leaves`, body: student.registrationNumber ?? undefined, url: "/console/alerts", tag: `leave-${studentId}` }));
      }
    }
  }

  return { attendance, student, delta, locked };
}

/**
 * The class dates of the run of leaves this class's leave belongs to, when that run
 * is ABSENCE_LOCK_RUN or longer. The student's own marked classes are put in date
 * order and the run is read through this one: consecutive leaves with no present
 * mark between them, every one counted in the current leave cycle (so a reactivated
 * or promoted student starts clean). A class nobody marked them for (no row)
 * neither breaks nor extends a run.
 */
async function absenceRun(student: typeof S.$inferSelect, classId: string): Promise<Date[] | null> {
  const rows = (
    await getDb()
      .select({ classId: A.classId, countedAsLeave: A.countedAsLeave, leaveGeneration: A.leaveGeneration, date: C.date, time: C.time, createdAt: C.createdAt })
      .from(A)
      .innerJoin(C, eq(C.id, A.classId))
      .where(eq(A.studentId, student.id))
  ).sort((x, y) => x.date.getTime() - y.date.getTime() || (x.time ?? "").localeCompare(y.time ?? "") || x.createdAt.getTime() - y.createdAt.getTime());

  const at = rows.findIndex((r) => r.classId === classId);
  if (at < 0) return null;
  const inRun = (i: number) => i >= 0 && i < rows.length && rows[i].countedAsLeave && rows[i].leaveGeneration === student.cycleGeneration;
  let from = at;
  let to = at;
  while (inRun(from - 1)) from--;
  while (inRun(to + 1)) to++;
  return to - from + 1 >= ABSENCE_LOCK_RUN ? rows.slice(from, to + 1).map((r) => r.date) : null;
}

function inBackground(work: Promise<unknown>) {
  const quiet = work.catch(() => {});
  const ctx = getCloudflareContext().ctx;
  if (ctx?.waitUntil) ctx.waitUntil(quiet);
}
