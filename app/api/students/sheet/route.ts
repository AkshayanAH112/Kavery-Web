import { eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { DETAIL_FIELDS, planSheet, type SheetRow } from "@/lib/keda/details-sheet";
import { batchMap, isGrade, newQrCode, nextRegistrationNumber, readBody, reserveRegistrationNumber, text } from "@/lib/keda/server";

const S = schema.students;
const MAX_ROWS = 400;

/**
 * Saves a detailed student sheet (see lib/keda/details-sheet.ts): rows whose
 * index number is registered update that student, the rest register new ones.
 *
 * The browser has already shown a preview made by the same `planSheet()`; it is
 * run again here on the database as it is now, and the rows are taken by field
 * name only. If any row has a problem nothing is saved.
 */
export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const fail = (error: string, problems?: { line: number; error: string }[]) => Response.json({ error, problems }, { status: 400 });
  if (!Array.isArray(data?.rows) || data.rows.length === 0) return fail("There are no rows to save");
  if (data.rows.length > MAX_ROWS) return fail(`Upload at most ${MAX_ROWS} rows at a time`);

  const rows: SheetRow[] = (data.rows as { line?: unknown; values?: Record<string, unknown> }[]).map((row, i) => ({
    line: Number.isInteger(row?.line) ? Number(row.line) : i + 2,
    values: Object.fromEntries(DETAIL_FIELDS.map((f) => [f, text(row?.values?.[f], 600)])),
  }));

  const db = getDb();
  const numbers = [...new Set(rows.map((r) => r.values.registrationNumber).filter((n): n is string => !!n))];
  const existing: (typeof S.$inferSelect)[] = [];
  for (let i = 0; i < numbers.length; i += 90) existing.push(...(await db.select().from(S).where(inArray(S.registrationNumber, numbers.slice(i, i + 90)))));
  const batches = [...(await batchMap()).values()];

  const plan = planSheet(rows, existing, batches, typeof data.defaultBatchId === "string" ? data.defaultBatchId : undefined);
  const problems = plan.flatMap((p) => (p.action === "error" ? [{ line: p.line, error: p.error }] : []));
  // planSheet checks a grade against the batch; this is the database's own rule as a last guard.
  for (const p of plan) if ((p.action === "create" || p.action === "update") && p.changes.grade !== undefined && !isGrade(p.changes.grade)) problems.push({ line: p.line, error: "Choose a grade" });
  if (problems.length) return fail(`${problems.length} row${problems.length === 1 ? " has a problem" : "s have problems"}. Nothing was saved.`, problems);

  const field = (value: string | number | undefined) => (value === undefined ? undefined : String(value));
  const updates = plan.flatMap((p) => (p.action === "update" ? [p] : []));
  for (let i = 0; i < updates.length; i += 40) {
    const group = updates.slice(i, i + 40).map(({ studentId, changes: c }) =>
      db
        .update(S)
        .set({
          name: field(c.name),
          school: field(c.school),
          address: field(c.address),
          guardianName: field(c.guardianName),
          guardianPhone: field(c.guardianPhone),
          whatsapp: field(c.whatsapp),
          notes: field(c.notes),
          grade: c.grade === undefined ? undefined : Number(c.grade),
          batchId: field(c.batch),
        })
        .where(eq(S.id, studentId)),
    );
    await db.batch(group as [(typeof group)[number], ...typeof group]);
  }

  const creates = plan.flatMap((p) => (p.action === "create" ? [p] : []));
  // Numbers already issued on paper move the counter first, so a number given out below cannot collide with one in the sheet.
  for (const p of creates) if (p.registrationNumber) await reserveRegistrationNumber(p.registrationNumber);
  const yearOf = new Map(batches.map((b) => [b.id, b.year]));
  const fresh = [];
  for (const { registrationNumber, changes: c } of creates) {
    const grade = Number(c.grade);
    fresh.push({
      name: String(c.name),
      school: field(c.school) ?? null,
      address: field(c.address) ?? null,
      // NOT NULL columns: "" means "not given yet", as for the paper-list import.
      guardianName: field(c.guardianName) ?? "",
      guardianPhone: field(c.guardianPhone) ?? "",
      whatsapp: field(c.whatsapp) ?? null,
      notes: field(c.notes) ?? null,
      grade,
      batchId: String(c.batch),
      qrCode: newQrCode(grade),
      registrationNumber: registrationNumber ?? (await nextRegistrationNumber(yearOf.get(String(c.batch))!)),
      registrationDate: new Date(),
    });
  }
  // D1 caps bound parameters per statement, so insert in small groups.
  for (let i = 0; i < fresh.length; i += 8) await db.insert(S).values(fresh.slice(i, i + 8));

  return Response.json({ created: creates.length, updated: updates.length, unchanged: plan.length - creates.length - updates.length });
}
