import { inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getBatch, isGrade, isRegistrationNumber, newQrCode, parseDate, readBody, reserveRegistrationNumber, text } from "@/lib/keda/server";

const S = schema.students;
const MAX_ROWS = 400;

/**
 * Brings in students who already exist on paper: a name and the index number
 * KEDA has already issued them. Nothing else is known at this point, so the
 * guardian fields are left empty for staff to complete on each student's page
 * (see the note on `students.guardianName` in db/schema.ts).
 *
 * Index numbers already in the database are skipped, never overwritten, so the
 * same sheet can be imported twice without creating duplicates.
 */
export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const fail = (error: string) => Response.json({ error }, { status: 400 });
  const batch = await getBatch(data?.batchId);
  if (!batch) return fail("Choose the batch these students belong to");
  if (!Array.isArray(data?.students) || data.students.length === 0) return fail("There are no students to import");
  if (data.students.length > MAX_ROWS) return fail(`Import at most ${MAX_ROWS} students at a time`);

  const registrationDate = parseDate(data.registrationDate) ?? new Date();
  const rows: { name: string; registrationNumber: string; grade: number }[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of (data.students as Record<string, unknown>[]).entries()) {
    const line = `Row ${index + 1}`;
    const name = text(entry?.name, 120);
    if (!name) return fail(`${line}: the name is empty`);
    if (!isRegistrationNumber(entry?.registrationNumber)) return fail(`${line}: "${text(entry?.registrationNumber, 40)}" is not an index number like KEDA/27/1000`);
    if (seen.has(entry.registrationNumber)) return fail(`${line}: index number ${entry.registrationNumber} appears twice in this import`);
    const grade = Number(entry?.grade);
    if (!isGrade(grade)) return fail(`${line}: choose a grade for ${name}`);
    if (!batch.grades.includes(grade)) return fail(`${line}: ${batch.name} does not teach Grade ${grade}`);
    seen.add(entry.registrationNumber);
    rows.push({ name, registrationNumber: entry.registrationNumber, grade });
  }

  const db = getDb();
  const existing = new Set<string>();
  const numbers = rows.map((r) => r.registrationNumber);
  for (let i = 0; i < numbers.length; i += 90) {
    for (const s of await db.select({ registrationNumber: S.registrationNumber }).from(S).where(inArray(S.registrationNumber, numbers.slice(i, i + 90)))) {
      if (s.registrationNumber) existing.add(s.registrationNumber);
    }
  }
  const fresh = rows.filter((r) => !existing.has(r.registrationNumber));

  // D1 caps bound parameters per statement, so insert in small groups; each batch call is one transaction.
  for (let i = 0; i < fresh.length; i += 8) {
    const group = fresh.slice(i, i + 8).map((r) => ({ ...r, guardianName: "", guardianPhone: "", qrCode: newQrCode(r.grade), registrationDate, batchId: batch.id }));
    await db.insert(S).values(group);
  }
  // Move each year's counter past the highest imported number, so the next new student does not collide.
  const highestByYear = new Map<string, string>();
  for (const r of fresh) {
    const year = r.registrationNumber.split("/")[1];
    const current = highestByYear.get(year);
    if (!current || Number(r.registrationNumber.split("/")[2]) > Number(current.split("/")[2])) highestByYear.set(year, r.registrationNumber);
  }
  for (const number of highestByYear.values()) await reserveRegistrationNumber(number);

  return Response.json({ imported: fresh.length, skipped: rows.length - fresh.length, skippedNumbers: [...existing] }, { status: 201 });
}
