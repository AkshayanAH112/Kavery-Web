import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { recordAttendance } from "@/lib/keda/attendance-recorder";
import { getClass, getRoster, type ClassRow } from "@/lib/keda/server";

const { classSessions: C, attendance: A } = schema;
const NOT_FOUND = () => Response.json({ error: "Class not found" }, { status: 404 });

/** Active students on the register who have no attendance row yet — neither present nor absent. */
async function getUnmarked(session: ClassRow) {
  const [roster, records] = await Promise.all([getRoster(session, { activeOnly: true }), getDb().select({ studentId: A.studentId }).from(A).where(eq(A.classId, session.id))]);
  const marked = new Set(records.map((r) => r.studentId));
  return roster.filter((s) => !marked.has(s.id));
}

/** Preview for the confirmation dialog: who would be marked absent. Writes nothing. */
export async function GET(_request: Request, { params }: RouteContext<"/api/classes/[id]/end">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();

  const unmarked = await getUnmarked(session);
  return Response.json({
    endedAt: session.endedAt?.toISOString() ?? null,
    unmarkedCount: unmarked.length,
    unmarked: unmarked.map((s) => ({ _id: s.id, name: s.name, registrationNumber: s.registrationNumber ?? undefined, currentLeaveCycle: s.currentLeaveCycle })),
  });
}

/**
 * Students handled by one request. The free Workers plan allows 50 D1 queries
 * per request: this route uses 5 of its own, and a student reaching a third leave
 * costs 8 in recordAttendance() plus 3 and one fetch per staff device for the
 * push. Staying well under matters: a request cut off between the attendance row
 * and the counter would leave a leave uncounted, and a retry would not see it.
 */
const BATCH_SIZE = 3;

/**
 * Closes the register. The scanner only ever marks students present, so a
 * no-show has no row at all; this turns every such student into a real, counted
 * leave. Students already marked are left alone, so it is safe to run twice.
 *
 * Each call handles one batch and answers how many remain; the page calls again
 * until none do, and only the last call marks the class as ended.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/classes/[id]/end">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();

  const unmarked = await getUnmarked(session);
  const batch = unmarked.slice(0, BATCH_SIZE);
  const remaining = unmarked.length - batch.length;

  const markedAbsent: { name: string; leaveCycle: number }[] = [];
  // One at a time, through the single attendance writer, so each leave counter and alert is exact.
  for (const student of batch) {
    const { student: updated } = await recordAttendance({ studentId: student.id, classId: session.id, present: false, markedBy: auth.session.userId });
    markedAbsent.push({ name: student.name, leaveCycle: updated?.currentLeaveCycle ?? 0 });
  }

  let endedAt: Date | null = null;
  if (remaining === 0) {
    endedAt = new Date();
    await getDb().update(C).set({ endedAt, endedBy: auth.session.userId }).where(eq(C.id, session.id));
  }
  return Response.json({
    success: true,
    endedAt: endedAt?.toISOString() ?? null,
    remaining,
    markedAbsentCount: markedAbsent.length,
    markedAbsent,
    warningsRaised: markedAbsent.filter((m) => m.leaveCycle === 2 || m.leaveCycle === 3).length,
  });
}

/** Reopens the register. The marker only: attendance rows are untouched and stay editable. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/classes/[id]/end">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();
  await getDb().update(C).set({ endedAt: null, endedBy: null }).where(eq(C.id, session.id));
  return Response.json({ success: true, endedAt: null });
}
