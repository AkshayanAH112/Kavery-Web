/**
 * The detailed student sheet: one row per student, one column per field.
 *
 * The console writes it (Students → Download Excel) and reads it back on the
 * import page, so details can be completed or corrected in Excel and uploaded.
 * The index number is the key: a row whose number is already registered updates
 * that student, any other row registers a new one.
 *
 * Pure (no spreadsheet library, no database), so the browser's preview and the
 * server's save run the same checks: `planSheet()` is called on both sides.
 */
import { INDEX_NUMBER } from "./import-sheet";

export const DETAIL_FIELDS = ["registrationNumber", "name", "grade", "batch", "school", "address", "guardianName", "guardianPhone", "whatsapp", "notes"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export type SheetValues = Partial<Record<DetailField, string>>;
/** `line` is the row number Excel shows, so a problem can be found in the file. */
export type SheetRow = { line: number; values: SheetValues };

export const DETAIL_HEADERS: Record<DetailField, string> = {
  registrationNumber: "Index number",
  name: "Name",
  grade: "Grade",
  batch: "Batch",
  school: "School",
  address: "Address",
  guardianName: "Guardian name",
  guardianPhone: "Guardian phone",
  whatsapp: "WhatsApp",
  notes: "Notes",
};

/** Fields typed in Tamil: the ones a Bamini-encoded sheet needs converting. */
export const TAMIL_FIELDS: readonly DetailField[] = ["name", "school", "address", "guardianName", "notes"];

const ALIASES: Record<DetailField, string[]> = {
  registrationNumber: ["index number", "index no", "index", "reg number", "registration number", "சுட்டெண்"],
  name: ["name", "student name", "student", "பெயர்", "மாணவர் பெயர்"],
  grade: ["grade", "தரம்"],
  batch: ["batch", "தொகுதி"],
  school: ["school", "பாடசாலை"],
  address: ["address", "முகவரி"],
  guardianName: ["guardian name", "guardian", "parent name", "parent", "பாதுகாவலர்", "பெற்றோர்"],
  guardianPhone: ["guardian phone", "phone", "phone number", "mobile", "contact number", "தொலைபேசி"],
  whatsapp: ["whatsapp", "whatsapp number"],
  notes: ["notes", "note", "remarks", "குறிப்பு"],
};

const LIMITS: Partial<Record<DetailField, number>> = { name: 120, guardianName: 120, school: 160, address: 300, notes: 500 };

const heading = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[.:#*()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Finds the header row (within the first 20) that names an index-number column
 * and a name column, each once. KEDA's paper lists repeat those two headings
 * side by side and are typed in Bamini, so they are not mistaken for this sheet.
 */
export function readDetailsSheet(rows: unknown[][]): SheetRow[] | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const columns = new Map<DetailField, number>();
    let repeated = false;
    rows[r].forEach((cell, c) => {
      const label = heading(cell);
      const field = DETAIL_FIELDS.find((f) => ALIASES[f].includes(label));
      if (!field) return;
      if (columns.has(field)) repeated = true;
      columns.set(field, c);
    });
    if (repeated || !columns.has("registrationNumber") || !columns.has("name")) continue;

    const found: SheetRow[] = [];
    for (let i = r + 1; i < rows.length; i++) {
      const values: SheetValues = {};
      for (const [field, c] of columns) values[field] = String(rows[i][c] ?? "").trim();
      if (!values.registrationNumber && !values.name) continue;
      found.push({ line: i + 1, values });
    }
    return found;
  }
  return null;
}

/** Excel drops a phone's leading 0 when the cell is a number, and some are typed with +94. */
export function normalisePhone(value: string) {
  const digits = value.replace(/[\s\-()]/g, "");
  if (/^\+?94\d{9}$/.test(digits)) return `0${digits.slice(-9)}`;
  if (/^[1-9]\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

const isPhone = (value: string) => /^0\d{9}$/.test(value);
/** Mirrors GRADES in lib/keda/server.ts, which cannot be imported in the browser. */
const KEDA_GRADES = [3, 4, 5];
const gradeOf = (value: string) => Number(value.replace(/^grade\s*/i, ""));

export type PlanStudent = {
  id: string;
  registrationNumber?: string | null;
  name: string;
  grade: number;
  batchId?: string | null;
  school?: string | null;
  address?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
};
export type PlanBatch = { id: string; name: string; year: number; grades: number[] };

/** What saving the field will store: `batch` holds the batch id. */
export type Changes = Partial<Record<Exclude<DetailField, "registrationNumber">, string | number>>;
export type Change = { field: Exclude<DetailField, "registrationNumber">; from: string; to: string };

export type PlannedRow =
  | { line: number; action: "create"; registrationNumber?: string; name: string; changes: Changes }
  | { line: number; action: "update"; registrationNumber: string; name: string; studentId: string; changes: Changes; shown: Change[] }
  | { line: number; action: "same"; registrationNumber: string; name: string }
  | { line: number; action: "error"; registrationNumber?: string; name: string; error: string };

/**
 * Decides what each row will do. A blank cell never clears anything: it leaves
 * the student's value as it is, so a sheet with only some columns filled is safe
 * to upload. The index number cannot be changed from a sheet, because it is the
 * key that finds the student.
 */
export function planSheet(rows: SheetRow[], students: PlanStudent[], batches: PlanBatch[], defaultBatchId?: string): PlannedRow[] {
  const byNumber = new Map(students.filter((s) => s.registrationNumber).map((s) => [s.registrationNumber!, s]));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const count = new Map<string, number>();
  for (const row of rows) {
    const n = row.values.registrationNumber;
    if (n) count.set(n, (count.get(n) ?? 0) + 1);
  }

  return rows.map(({ line, values }): PlannedRow => {
    const registrationNumber = values.registrationNumber || undefined;
    const existing = registrationNumber ? byNumber.get(registrationNumber) : undefined;
    const name = (values.name || existing?.name || "").slice(0, LIMITS.name);
    const fail = (error: string): PlannedRow => ({ line, action: "error", registrationNumber, name, error });

    if (registrationNumber && !INDEX_NUMBER.test(registrationNumber)) return fail(`"${registrationNumber}" is not an index number like KEDA/27/1000`);
    if (registrationNumber && count.get(registrationNumber)! > 1) return fail(`${registrationNumber} is on more than one row`);

    let batch: PlanBatch | undefined;
    if (values.batch) {
      const matches = batches.filter((b) => b.name.trim().toLowerCase() === values.batch!.toLowerCase());
      if (matches.length !== 1) return fail(matches.length ? `More than one batch is called "${values.batch}"` : `There is no batch called "${values.batch}"`);
      batch = matches[0];
    } else {
      batch = (existing?.batchId && batchById.get(existing.batchId)) || (existing ? undefined : batchById.get(defaultBatchId ?? ""));
    }
    if (!existing && !batch) return fail("Choose the batch for new students");

    const changes: Changes = {};
    for (const field of ["name", "school", "address", "guardianName", "notes"] as const) {
      const value = values[field]?.slice(0, LIMITS[field]);
      if (value && value !== (existing?.[field] ?? "")) changes[field] = value;
    }
    for (const field of ["guardianPhone", "whatsapp"] as const) {
      if (!values[field]) continue;
      const phone = normalisePhone(values[field]!);
      if (!isPhone(phone)) return fail(`${DETAIL_HEADERS[field]} "${values[field]}" is not a 10-digit number starting with 0`);
      if (phone !== (existing?.[field] ?? "")) changes[field] = phone;
    }
    if (batch && batch.id !== existing?.batchId) changes.batch = batch.id;

    const grade = values.grade ? gradeOf(values.grade) : existing?.grade;
    if (grade === undefined) return fail("The grade is empty");
    if (batch ? !batch.grades.includes(grade) : !KEDA_GRADES.includes(grade)) return fail(`${batch?.name ?? "KEDA"} does not teach Grade ${Number.isNaN(grade) ? `"${values.grade}"` : grade}`);
    if (grade !== existing?.grade) changes.grade = grade;

    if (!existing) {
      if (!values.name) return fail("The name is empty");
      return { line, action: "create", registrationNumber, name, changes };
    }
    const shown: Change[] = Object.keys(changes).map((key) => {
      const field = key as Change["field"];
      if (field === "batch") return { field, from: batchById.get(existing.batchId ?? "")?.name ?? "—", to: batch!.name };
      return { field, from: String(existing[field] ?? "") || "—", to: String(changes[field]) };
    });
    if (shown.length === 0) return { line, action: "same", registrationNumber: registrationNumber!, name };
    return { line, action: "update", registrationNumber: registrationNumber!, name, studentId: existing.id, changes, shown };
  });
}

type ExportStudent = Omit<PlanStudent, "id" | "batchId"> & { batchName?: string };

/** The sheet the console downloads: the same columns the import reads. */
export function detailsSheetRows(students: ExportStudent[]): (string | number)[][] {
  return [
    DETAIL_FIELDS.map((f) => DETAIL_HEADERS[f]),
    ...students.map((s) => DETAIL_FIELDS.map((f) => (f === "batch" ? (s.batchName ?? "") : f === "grade" ? s.grade : (s[f] ?? "")))),
  ];
}
