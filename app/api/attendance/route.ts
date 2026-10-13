import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { recordAttendance } from "@/lib/keda/attendance-recorder";
import { attendanceDoc, getClass, getStudent, readBody, text } from "@/lib/keda/server";

const A = schema.attendance;

/** Marks one student present or absent for one class. */
export async function POST(request: Request) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const student = await getStudent(data?.studentId);
  if (!student) return Response.json({ error: "Student not found" }, { status: 404 });
  const session = await getClass(data?.classId);
  if (!session) return Response.json({ error: "Class not found" }, { status: 404 });

  if (student.grade !== session.grade) return Response.json({ error: `Student is Grade ${student.grade}, class is Grade ${session.grade}` }, { status: 400 });
  if (student.registrationDate && session.date < student.registrationDate) {
    return Response.json(
      { error: `Cannot record attendance: student registered on ${student.registrationDate.toDateString()}, after this class (${session.date.toDateString()})` },
      { status: 400 },
    );
  }

  const { attendance, student: updated } = await recordAttendance({
    studentId: student.id,
    classId: session.id,
    present: data?.present !== false,
    remarks: data?.remarks !== undefined ? text(data.remarks, 300) : undefined,
    markedBy: auth.session.userId,
  });

  const db = getDb();
  const [attendedCount, recordedCount] = await Promise.all([db.$count(A, and(eq(A.studentId, student.id), eq(A.present, true))), db.$count(A, eq(A.studentId, student.id))]);
  return Response.json({
    success: true,
    attendance: attendanceDoc(attendance),
    attendedCount,
    recordedCount,
    totalLeaves: updated?.totalLeaves ?? student.totalLeaves,
    currentLeaveCycle: updated?.currentLeaveCycle ?? student.currentLeaveCycle,
  });
}
