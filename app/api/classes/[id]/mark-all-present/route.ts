import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { recordAttendance } from "@/lib/keda/attendance-recorder";
import { getClass, getRoster } from "@/lib/keda/server";

const A = schema.attendance;

/**
 * Students handled by one request. The free Workers plan allows 50 D1 queries
 * per request: this route uses 4 before the loop and recordAttendance() up to 5
 * per student, so 8 students is at most 44.
 */
const BATCH_SIZE = 8;

/**
 * Marks present every active student on the register who is not already,
 * including anyone marked absent, whose leave is taken back. Each call handles
 * one batch and answers how many remain; the page calls again until none do.
 * Students already present are skipped, so a retry after a failure is safe.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/classes/[id]/mark-all-present">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return Response.json({ error: "Class not found" }, { status: 404 });

  const [roster, records] = await Promise.all([getRoster(session, { activeOnly: true }), getDb().select({ studentId: A.studentId, present: A.present }).from(A).where(eq(A.classId, session.id))]);
  const present = new Set(records.filter((r) => r.present).map((r) => r.studentId));
  const waiting = roster.filter((s) => !present.has(s.id));
  const batch = waiting.slice(0, BATCH_SIZE);

  // One at a time, through the single attendance writer, so each leave counter stays exact.
  for (const student of batch) {
    await recordAttendance({ studentId: student.id, classId: session.id, present: true, markedBy: auth.session.userId });
  }

  return Response.json({ success: true, marked: batch.length, remaining: waiting.length - batch.length });
}
