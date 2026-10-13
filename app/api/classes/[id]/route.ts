import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { classDoc, getBatch, getClass, getRoster, isGrade, parseDate, readBody, studentDoc, text } from "@/lib/keda/server";

const { classSessions: C, attendance: A } = schema;
const NOT_FOUND = () => Response.json({ error: "Class not found" }, { status: 404 });

/** A class and its register: every eligible student, and whether each has been marked yet. */
export async function GET(_request: Request, { params }: RouteContext<"/api/classes/[id]">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();

  const [batch, students, records] = await Promise.all([getBatch(session.batchId), getRoster(session), getDb().select().from(A).where(eq(A.classId, session.id))]);
  const brief = !can(auth.session.role, "education.manage");
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  return Response.json({
    classSession: classDoc(session, batch),
    roster: students.map((student) => {
      const record = recordByStudent.get(student.id);
      // isRecorded separates "marked absent" from "not marked yet" — both have isPresent false.
      return { student: studentDoc(student, { brief }), isPresent: record ? record.present : false, isRecorded: Boolean(record), attendanceId: record?.id ?? null };
    }),
  });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/classes/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();

  const data = await readBody(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  if (!data) return fail("Invalid request");

  const update: Partial<typeof C.$inferInsert> = {};
  if (data.batchId !== undefined) {
    const batch = await getBatch(data.batchId);
    if (!batch) return fail("Batch not found", 404);
    update.batchId = batch.id;
  }
  if (data.grade !== undefined) {
    if (!isGrade(Number(data.grade))) return fail("Choose the grade this class is for");
    update.grade = Number(data.grade);
  }
  if (data.date !== undefined) {
    const date = parseDate(data.date);
    if (!date) return fail("Choose the date of the class");
    update.date = date;
  }
  if (data.time !== undefined) update.time = text(data.time, 20) || null;
  if (data.subject !== undefined) update.subject = text(data.subject, 80) || null;

  const [updated] = Object.keys(update).length ? await getDb().update(C).set(update).where(eq(C.id, session.id)).returning() : [session];
  return Response.json({ classSession: classDoc(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/classes/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const session = await getClass((await params).id);
  if (!session) return NOT_FOUND();

  const db = getDb();
  const attendanceCount = await db.$count(A, eq(A.classId, session.id));
  if (attendanceCount > 0) return Response.json({ error: `Cannot delete: ${attendanceCount} attendance record(s) already exist for this class` }, { status: 409 });
  await db.delete(C).where(eq(C.id, session.id));
  return Response.json({ success: true });
}
