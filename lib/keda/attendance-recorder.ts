import { and, asc, between, eq, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/lib/db";
import { sendPushToTopic } from "@/lib/push";

const { attendance: A, students: S, classSessions: C, leaveAlerts: L } = schema;

/**
 * THE one place an attendance row is written. It flips `present`, moves
 * `countedAsLeave`, keeps the student's leave counters in step, and raises the
 * 2-leave and 3-leave alerts. Both callers — marking one student and closing a
 * register — go through here. Never write an attendance row from anywhere else:
 * the two paths would drift and `totalLeaves` would stop matching the rows.
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

  if (delta !== 0 && student) {
    // totalLeaves is a lifetime counter; currentLeaveCycle resets on reactivation and promotion.
    [student] = await db
      .update(S)
      .set({ totalLeaves: sql`max(0, ${S.totalLeaves} + ${delta})`, currentLeaveCycle: sql`max(0, ${S.currentLeaveCycle} + ${delta})` })
      .where(eq(S.id, studentId))
      .returning();

    if (delta === 1) {
      // Stamped once: which leave of the cycle this was at the time. A later correction does not rewrite it.
      await db.update(A).set({ leaveCycleAtRecord: student.currentLeaveCycle }).where(eq(A.id, attendance.id));
      attendance.leaveCycleAtRecord = student.currentLeaveCycle;

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

        if (created.length > 0 && type === "admin_critical") {
          const push = sendPushToTopic("staff", {
            title: `${student.name} has reached 3 leaves`,
            body: student.registrationNumber ?? undefined,
            url: "/console/alerts",
            tag: `leave-${studentId}`,
          }).catch(() => {});
          const ctx = getCloudflareContext().ctx;
          if (ctx?.waitUntil) ctx.waitUntil(push);
        }
      }
    }
  }

  return { attendance, student, delta };
}
