import { and, desc, eq, gte } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { PHONE_ERROR, batchMap, getBatch, isGrade, isRegistrationNumber, isValidLocalPhone, newQrCode, nextRegistrationNumber, parseDate, readBody, reserveRegistrationNumber, studentDoc, text } from "@/lib/keda/server";

const S = schema.students;

export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const cycle = q.get("cycle");
  const isActive = q.get("isActive");
  const where = and(
    q.get("grade") ? eq(S.grade, Number(q.get("grade"))) : undefined,
    q.get("batchId") ? eq(S.batchId, q.get("batchId")!) : undefined,
    cycle ? (cycle === "3+" ? gte(S.currentLeaveCycle, 3) : eq(S.currentLeaveCycle, Number(cycle))) : undefined,
    isActive !== null ? eq(S.isActive, isActive === "true") : undefined,
  );

  const [rows, batches] = await Promise.all([getDb().select().from(S).where(where).orderBy(desc(S.createdAt)), batchMap()]);
  return Response.json({ students: rows.map((s) => studentDoc(s, { batch: s.batchId ? batches.get(s.batchId) : null })) });
}

export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  if (!data) return fail("Invalid request");

  const name = text(data.name, 120);
  const guardianName = text(data.guardianName, 120);
  if (!name) return fail("Student name is required");
  if (!guardianName) return fail("Parent or guardian name is required");
  const grade = Number(data.grade);
  if (!isGrade(grade)) return fail("Choose the student's grade");
  if (!isValidLocalPhone(data.guardianPhone)) return fail(PHONE_ERROR);
  if (data.whatsapp && !isValidLocalPhone(data.whatsapp)) return fail("WhatsApp number must be a valid 10-digit number starting with 0");

  const batch = await getBatch(data.batchId);
  if (!batch) return fail("A batch is required to register a student");

  const db = getDb();
  // A number already issued on paper can be entered as-is; otherwise the next one for the batch's year is taken.
  let registrationNumber: string;
  if (data.registrationNumber) {
    if (!isRegistrationNumber(data.registrationNumber)) return fail("Index number must look like KEDA/27/1000");
    if (await db.query.students.findFirst({ where: eq(S.registrationNumber, data.registrationNumber) })) return fail("That index number is already in use", 409);
    registrationNumber = data.registrationNumber;
    await reserveRegistrationNumber(registrationNumber);
  } else {
    registrationNumber = await nextRegistrationNumber(batch.year);
  }

  const [student] = await db
    .insert(S)
    .values({
      name,
      school: text(data.school, 160) || null,
      address: text(data.address, 300) || null,
      guardianName,
      guardianPhone: data.guardianPhone.replace(/[\s-]/g, ""),
      whatsapp: data.whatsapp ? String(data.whatsapp).replace(/[\s-]/g, "") : null,
      notes: text(data.notes, 500) || null,
      grade,
      qrCode: newQrCode(grade),
      registrationNumber,
      // The cutoff for class eligibility: a mid-batch joiner is not on earlier registers.
      registrationDate: parseDate(data.registrationDate) ?? new Date(),
      batchId: batch.id,
    })
    .returning();
  return Response.json({ student: studentDoc(student) }, { status: 201 });
}
