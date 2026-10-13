import { desc, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { deletePrivateFiles } from "@/lib/private-files";
import { can } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { PHONE_ERROR, attendanceDoc, getBatch, getStudent, isGrade, isRegistrationNumber, isValidLocalPhone, marksForStudent, readBody, reserveRegistrationNumber, studentDoc, text } from "@/lib/keda/server";

const { students: S, attendance: A, classSessions: C, marks: M, leaveAlerts: L } = schema;
const NOT_FOUND = () => Response.json({ error: "Student not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/students/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const student = await getStudent((await params).id);
  if (!student) return NOT_FOUND();

  const db = getDb();
  const [batch, attendanceRows, marks] = await Promise.all([
    getBatch(student.batchId),
    db.select().from(A).where(eq(A.studentId, student.id)).orderBy(desc(A.date)),
    marksForStudent(student.id),
  ]);
  const classIds = [...new Set(attendanceRows.map((a) => a.classId))];
  const sessions = classIds.length ? await db.select().from(C).where(inArray(C.id, classIds)) : [];
  const sessionById = new Map(sessions.map((c) => [c.id, c]));

  // The rate is for the student's current grade only, so last year's register does not dilute it.
  const current = attendanceRows.filter((a) => sessionById.get(a.classId)?.grade === student.grade);
  const classesPresent = current.filter((a) => a.present).length;

  // An absent paper is stored as 0 but is not a score: it is left out of every average.
  const sat = marks.filter((m) => !m.isAbsent);
  const scored = sat.reduce((sum, m) => sum + m.marks, 0);
  const max = sat.reduce((sum, m) => sum + m.maxMarks, 0);
  const bySubject = new Map<string, { subject: string; scored: number; max: number; count: number }>();
  for (const m of sat) {
    const entry = bySubject.get(m.subject) ?? { subject: m.subject, scored: 0, max: 0, count: 0 };
    entry.scored += m.marks;
    entry.max += m.maxMarks;
    entry.count += 1;
    bySubject.set(m.subject, entry);
  }

  return Response.json({
    student: studentDoc(student, { batch }),
    attendance: attendanceRows.map((a) => attendanceDoc(a, sessionById.get(a.classId))),
    marks,
    analytics: {
      attendancePercentage: current.length > 0 ? Math.round((classesPresent / current.length) * 100) : 0,
      classesPresent,
      totalClasses: current.length,
      averageMarks: max > 0 ? Math.round((scored / max) * 100) : 0,
      subjectAverages: [...bySubject.values()].map((s) => ({ subject: s.subject, average: s.max > 0 ? Math.round((s.scored / s.max) * 100) : 0, count: s.count })),
    },
  });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/students/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const existing = await getStudent((await params).id);
  if (!existing) return NOT_FOUND();

  const data = await readBody(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  if (!data) return fail("Invalid request");

  const update: Partial<typeof S.$inferInsert> = {};
  if (data.name !== undefined) {
    if (!text(data.name, 120)) return fail("Student name is required");
    update.name = text(data.name, 120);
  }
  if (data.guardianName !== undefined) {
    if (!text(data.guardianName, 120)) return fail("Parent or guardian name is required");
    update.guardianName = text(data.guardianName, 120);
  }
  if (data.guardianPhone !== undefined) {
    if (!isValidLocalPhone(data.guardianPhone)) return fail(PHONE_ERROR);
    update.guardianPhone = data.guardianPhone.replace(/[\s-]/g, "");
  }
  if (data.whatsapp !== undefined) {
    if (data.whatsapp && !isValidLocalPhone(data.whatsapp)) return fail("WhatsApp number must be a valid 10-digit number starting with 0");
    update.whatsapp = data.whatsapp ? String(data.whatsapp).replace(/[\s-]/g, "") : null;
  }
  if (data.school !== undefined) update.school = text(data.school, 160) || null;
  if (data.address !== undefined) update.address = text(data.address, 300) || null;
  if (data.notes !== undefined) update.notes = text(data.notes, 500) || null;
  if (data.isActive !== undefined) update.isActive = !!data.isActive;
  if (data.grade !== undefined) {
    if (!isGrade(Number(data.grade))) return fail("Choose the student's grade");
    update.grade = Number(data.grade);
  }
  if (data.batchId !== undefined) {
    const batch = await getBatch(data.batchId);
    if (!batch) return fail("Batch not found", 404);
    update.batchId = batch.id;
  }

  // The index number is printed on the student's card, so changing it is an admin-only, explicit act.
  if (data.registrationNumber !== undefined && data.registrationNumber !== existing.registrationNumber) {
    if (!data.allowRegistrationNumberEdit || !can(auth.session.role, "staff.manage")) {
      return fail("The index number can only be changed by an administrator, with allowRegistrationNumberEdit: true", 403);
    }
    if (!isRegistrationNumber(data.registrationNumber)) return fail("Index number must look like KEDA/27/1000");
    if (await getDb().query.students.findFirst({ where: eq(S.registrationNumber, data.registrationNumber) })) return fail("That index number is already in use", 409);
    update.registrationNumber = data.registrationNumber;
    await reserveRegistrationNumber(data.registrationNumber);
  }

  // Reactivation starts a fresh leave cycle. totalLeaves is lifetime and is never reset.
  if (data.isActive === true && existing.isActive === false) {
    update.currentLeaveCycle = 0;
    update.cycleGeneration = existing.cycleGeneration + 1;
  }

  const [student] = Object.keys(update).length ? await getDb().update(S).set(update).where(eq(S.id, existing.id)).returning() : [existing];
  return Response.json({ student: studentDoc(student) });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/students/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const student = await getStudent((await params).id);
  if (!student) return NOT_FOUND();

  const db = getDb();
  const force = new URL(request.url).searchParams.get("force") === "true";
  const [attendanceCount, marksCount] = await Promise.all([db.$count(A, eq(A.studentId, student.id)), db.$count(M, eq(M.studentId, student.id))]);

  if (attendanceCount > 0 || marksCount > 0) {
    if (!force) {
      return Response.json(
        { error: `Cannot delete: this student has ${attendanceCount} attendance record(s) and ${marksCount} mark(s). Deactivate instead, or pass ?force=true to permanently erase everything (administrator only).` },
        { status: 409 },
      );
    }
    if (!can(auth.session.role, "staff.manage")) return Response.json({ error: "Only an administrator can force-delete a student with existing records" }, { status: 403 });
  }

  // One transaction: the student never disappears while their records are left behind.
  await db.batch([db.delete(A).where(eq(A.studentId, student.id)), db.delete(M).where(eq(M.studentId, student.id)), db.delete(L).where(eq(L.studentId, student.id)), db.delete(S).where(eq(S.id, student.id))]);
  await deletePrivateFiles([student.photoKey]);
  return Response.json({ success: true });
}
