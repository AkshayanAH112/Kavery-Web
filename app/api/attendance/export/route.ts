import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { batchMap, sortByIndexNumber } from "@/lib/keda/server";

const { classSessions: C, students: S, attendance: A } = schema;
type Status = "present" | "leave" | "not_eligible" | "not_recorded";

/**
 * Attendance for a date range as a student × class grid. Four states per cell,
 * because they mean different things: present, leave (marked absent), not
 * recorded (no row — the register was never closed), and not eligible (the
 * student had not registered yet).
 */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const fromParam = new Date(q.get("from") ?? "");
  const toParam = new Date(q.get("to") ?? "");
  if (Number.isNaN(fromParam.getTime()) || Number.isNaN(toParam.getTime())) return Response.json({ error: "from and to dates are required" }, { status: 400 });

  // The form sends calendar dates; read them as Sri Lankan days, not UTC ones.
  const from = getDayRange(fromParam.getTime() + 12 * 3600000).start;
  const to = new Date(getDayRange(toParam.getTime() + 12 * 3600000).end.getTime() - 1);
  const grade = q.get("grade");
  const batchId = q.get("batchId");

  const db = getDb();
  const sessions = await db
    .select()
    .from(C)
    .where(and(gte(C.date, from), lte(C.date, to), grade ? eq(C.grade, Number(grade)) : undefined, batchId ? eq(C.batchId, batchId) : undefined))
    .orderBy(asc(C.date));
  const range = { from: from.toISOString(), to: to.toISOString() };
  if (sessions.length === 0) return Response.json({ range, sessions: [], rows: [] });

  const batchIds = [...new Set(sessions.map((s) => s.batchId))];
  const [students, records, batches] = await Promise.all([
    db.select().from(S).where(inArray(S.batchId, batchIds)),
    db.select().from(A).where(inArray(A.classId, sessions.map((s) => s.id))),
    batchMap(batchIds),
  ]);
  const recordKey = (studentId: string, classId: string) => `${studentId}|${classId}`;
  const recordByKey = new Map(records.map((r) => [recordKey(r.studentId, r.classId), r]));

  const rows = sortByIndexNumber(students).map((student) => {
    const byClassId: Record<string, Status> = {};
    let totalPresent = 0;
    let totalLeaves = 0;
    let eligibleCount = 0;
    for (const session of sessions) {
      if (student.batchId !== session.batchId || student.grade !== session.grade) continue;
      if (student.registrationDate && student.registrationDate > session.date) {
        byClassId[session.id] = "not_eligible";
        continue;
      }
      eligibleCount += 1;
      const record = recordByKey.get(recordKey(student.id, session.id));
      if (record?.present) {
        byClassId[session.id] = "present";
        totalPresent += 1;
      } else if (record?.countedAsLeave) {
        byClassId[session.id] = "leave";
        totalLeaves += 1;
      } else {
        byClassId[session.id] = "not_recorded";
      }
    }
    return {
      studentId: student.id,
      registrationNumber: student.registrationNumber ?? "—",
      name: student.name,
      guardianName: student.guardianName ?? "—",
      guardianPhone: student.guardianPhone ?? "—",
      grade: student.grade,
      batchName: (student.batchId && batches.get(student.batchId)?.name) ?? "—",
      byClassId,
      totalPresent,
      totalLeaves,
      eligibleCount,
      attendancePercent: eligibleCount > 0 ? Math.round((totalPresent / eligibleCount) * 100) : null,
    };
  });

  return Response.json({
    range,
    sessions: sessions.map((s) => ({ _id: s.id, date: s.date.toISOString(), subject: s.subject ?? undefined, grade: s.grade, batchName: batches.get(s.batchId)?.name ?? "—" })),
    rows: rows.filter((r) => Object.keys(r.byClassId).length > 0),
  });
}
