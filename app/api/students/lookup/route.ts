import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { attendanceDoc, getBatch, getClass, studentDoc } from "@/lib/keda/server";

const { students: S, attendance: A } = schema;

/** The scanner's first call: who is this card, and may they be marked for this class? */
export async function GET(request: Request) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const qrCode = q.get("qrCode");
  if (!qrCode) return Response.json({ error: "QR code missing" }, { status: 400 });

  const db = getDb();
  const row = await db.query.students.findFirst({ where: eq(S.qrCode, qrCode) });
  if (!row) return Response.json({ error: "Student not found" }, { status: 404 });

  const records = await db.select({ present: A.present }).from(A).where(eq(A.studentId, row.id));
  const attendedCount = records.filter((r) => r.present).length;
  const summary = { attendedCount, recordedCount: records.length, attendanceRate: records.length > 0 ? Math.round((attendedCount / records.length) * 100) : null };
  // An attendance marker sees who the card belongs to, not the family's contact details.
  const student = studentDoc(row, { batch: await getBatch(row.batchId), brief: !can(auth.session.role, "education.manage") });

  const classId = q.get("classId");
  if (!classId) return Response.json({ student, ...summary });

  const session = await getClass(classId);
  if (!session) return Response.json({ error: "Class not found" }, { status: 404 });
  if (row.grade !== session.grade) return Response.json({ error: `Warning: Student is Grade ${row.grade}, Class is Grade ${session.grade}` }, { status: 400 });
  if (row.registrationDate && session.date < row.registrationDate) {
    return Response.json({ error: `Warning: Student registered on ${row.registrationDate.toDateString()}, after this class (${session.date.toDateString()})` }, { status: 400 });
  }

  const existing = await db.query.attendance.findFirst({ where: and(eq(A.studentId, row.id), eq(A.classId, session.id)) });
  return Response.json({ student, ...summary, existingRecord: existing ? attendanceDoc(existing) : null });
}
