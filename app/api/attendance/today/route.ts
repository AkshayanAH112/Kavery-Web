import { and, asc, gte, inArray, lt } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";
import { getTodayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { batchMap, classDoc, sortByIndexNumber, studentDoc } from "@/lib/keda/server";

const { classSessions: C, students: S, attendance: A } = schema;

/** Today's classes (Sri Lanka's "today", not the server's) with each register split into present / absent / not marked. */
export async function GET() {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;

  const db = getDb();
  const { start, end } = getTodayRange();
  const sessions = await db.select().from(C).where(and(gte(C.date, start), lt(C.date, end))).orderBy(asc(C.time));
  if (sessions.length === 0) return Response.json({ sessions: [] });

  const [students, records, batches] = await Promise.all([
    db.select().from(S).where(inArray(S.batchId, [...new Set(sessions.map((s) => s.batchId))])),
    db.select().from(A).where(inArray(A.classId, sessions.map((s) => s.id))),
    batchMap(sessions.map((s) => s.batchId)),
  ]);
  const ordered = sortByIndexNumber(students);
  const brief = !can(auth.session.role, "education.manage");

  return Response.json({
    sessions: sessions.map((session) => ({
      classSession: classDoc(session, batches.get(session.batchId)),
      roster: ordered
        .filter((s) => s.batchId === session.batchId && s.grade === session.grade && (!s.registrationDate || s.registrationDate <= session.date))
        .map((student) => {
          const record = records.find((r) => r.studentId === student.id && r.classId === session.id);
          return { student: studentDoc(student, { brief }), isPresent: record ? record.present : false, isRecorded: Boolean(record) };
        }),
    })),
  });
}
