/**
 * Database-side helpers for the KEDA tuition routes.
 *
 * The console screens for classes are ported from KCSC and read Mongo-shaped
 * JSON (`_id`, ISO dates, a referenced record optionally "populated" in place).
 * Everything here turns D1 rows into those shapes, so the screens did not have
 * to change when the storage did.
 *
 * KEDA classes are free. Nothing in this domain has a fee, and nothing should.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { keepLettersApart } from "@/lib/keda/bamini";

const { batches: B, students: S, classSessions: C, counters, exams: E, marks: M } = schema;

export type BatchRow = typeof B.$inferSelect;
export type StudentRow = typeof S.$inferSelect;
export type ClassRow = typeof C.$inferSelect;
export type AttendanceRow = typeof schema.attendance.$inferSelect;
export type AlertRow = typeof schema.leaveAlerts.$inferSelect;

export const GRADES = [3, 4, 5] as const;
export const isGrade = (value: unknown): value is number => typeof value === "number" && (GRADES as readonly number[]).includes(value);

export const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,64}$/.test(id);
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : undefined);

/* ------------------------------------------------------------ row → document */

export const batchDoc = (b: BatchRow) => ({
  _id: b.id,
  name: b.name,
  year: b.year,
  grades: b.grades,
  autoPromote: b.autoPromote,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});
export type BatchDoc = ReturnType<typeof batchDoc>;

/**
 * `batch` set = the batch is embedded where KCSC populated it; otherwise the id.
 * `brief` leaves out the family's contact details — it is what the
 * attendance-marker role receives, since marking a register needs a name and an
 * index number and nothing else.
 */
export function studentDoc(s: StudentRow, opts: { batch?: BatchRow | null; brief?: boolean } = {}) {
  const base = {
    _id: s.id,
    name: s.name,
    grade: s.grade,
    // A private file behind /api/students/[id]/photo. The suffix changes when the photo does, so a new one is not hidden by the browser's copy.
    photoUrl: s.photoKey ? `/api/students/${s.id}/photo?v=${s.photoKey.slice(-12, -4)}` : undefined,
    qrCode: s.qrCode,
    registrationNumber: s.registrationNumber ?? undefined,
    registrationDate: iso(s.registrationDate),
    batchId: opts.batch ? batchDoc(opts.batch) : (s.batchId ?? undefined),
    isActive: s.isActive,
    totalLeaves: s.totalLeaves,
    currentLeaveCycle: s.currentLeaveCycle,
    cycleGeneration: s.cycleGeneration,
  };
  if (opts.brief) return base;
  return {
    ...base,
    school: s.school ?? undefined,
    address: s.address ?? undefined,
    // Empty for a student imported from a paper list — see the note in db/schema.ts.
    guardianName: s.guardianName || undefined,
    guardianPhone: s.guardianPhone || undefined,
    whatsapp: s.whatsapp ?? undefined,
    notes: s.notes ?? undefined,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export const classDoc = (c: ClassRow, batch?: BatchRow | null) => ({
  _id: c.id,
  batchId: batch ? batchDoc(batch) : c.batchId,
  grade: c.grade,
  date: c.date.toISOString(),
  time: c.time ?? undefined,
  subject: c.subject ?? undefined,
  endedAt: iso(c.endedAt),
  endedBy: c.endedBy ?? undefined,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const attendanceDoc = (a: AttendanceRow, session?: ClassRow | null) => ({
  _id: a.id,
  studentId: a.studentId,
  classId: session ? classDoc(session) : a.classId,
  present: a.present,
  date: a.date.toISOString(),
  countedAsLeave: a.countedAsLeave,
  leaveCycleAtRecord: a.leaveCycleAtRecord ?? undefined,
  remarks: a.remarks ?? undefined,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

export const alertDoc = (n: AlertRow, student?: ReturnType<typeof studentDoc> | null) => ({
  _id: n.id,
  studentId: student ?? n.studentId,
  registrationNumber: n.registrationNumber ?? undefined,
  studentName: n.studentName ?? undefined,
  type: n.type,
  cycleGeneration: n.cycleGeneration,
  leaveCount: n.leaveCount,
  leaveDates: n.leaveDates.map((ms) => new Date(ms).toISOString()),
  status: n.status,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

/* -------------------------------------------------------------------- reads */

export async function getBatch(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.batches.findFirst({ where: eq(B.id, id) })) ?? null;
}

export async function getStudent(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.students.findFirst({ where: eq(S.id, id) })) ?? null;
}

export async function getClass(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.classSessions.findFirst({ where: eq(C.id, id) })) ?? null;
}

export async function batchMap(ids?: (string | null | undefined)[]) {
  const wanted = ids ? [...new Set(ids.filter(isId))] : null;
  if (wanted && wanted.length === 0) return new Map<string, BatchRow>();
  const rows = await getDb().select().from(B).where(wanted ? inArray(B.id, wanted) : undefined);
  return new Map(rows.map((b) => [b.id, b]));
}

/**
 * Rosters are ordered by index number. Not `ORDER BY registration_number`: a
 * student without one would sort to the top of every register — these go last,
 * by name.
 */
export function sortByIndexNumber<T extends { registrationNumber?: string | null; name?: string | null }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const aNo = a.registrationNumber ?? "";
    const bNo = b.registrationNumber ?? "";
    if (aNo && bNo) return aNo.localeCompare(bNo, undefined, { numeric: true });
    if (aNo) return -1;
    if (bNo) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

/**
 * Who is on the register for a class: same batch and grade, and registered on
 * or before the class date (a student who joined mid-batch is not marked absent
 * for classes held before they arrived). `activeOnly` is used when closing a
 * register; the plain roster keeps deactivated students so their history shows.
 */
export async function getRoster(session: ClassRow, opts: { activeOnly?: boolean } = {}) {
  const rows = await getDb()
    .select()
    .from(S)
    .where(and(eq(S.batchId, session.batchId), eq(S.grade, session.grade), opts.activeOnly ? eq(S.isActive, true) : undefined));
  return sortByIndexNumber(rows.filter((s) => !s.registrationDate || s.registrationDate <= session.date));
}

/* ---------------------------------------------------- registration numbers */

const REG_PATTERN = /^KEDA\/(\d{2})\/(\d{4,})$/;
const FIRST_NUMBER = 1000;

export const isRegistrationNumber = (value: unknown): value is string => typeof value === "string" && REG_PATTERN.test(value);

/**
 * "KEDA/27/1000": the batch's exam year, then a sequence that starts at 1000
 * each year — the format on KEDA's own paper registers. The counter is bumped
 * in one statement, so two registrations at once can never share a number.
 */
export async function nextRegistrationNumber(year: number) {
  const [row] = await getDb()
    .insert(counters)
    .values({ id: `regno-${year}`, seq: 1 })
    .onConflictDoUpdate({ target: counters.id, set: { seq: sql`${counters.seq} + 1` } })
    .returning({ seq: counters.seq });
  return `KEDA/${String(year % 100).padStart(2, "0")}/${FIRST_NUMBER - 1 + row.seq}`;
}

/**
 * When a student is entered with a number already issued on paper, move that
 * year's counter past it so the next automatic number does not collide.
 */
export async function reserveRegistrationNumber(registrationNumber: string) {
  const match = REG_PATTERN.exec(registrationNumber);
  if (!match) return;
  const year = 2000 + Number(match[1]);
  const seq = Number(match[2]) - (FIRST_NUMBER - 1);
  if (seq < 1) return;
  await getDb()
    .insert(counters)
    .values({ id: `regno-${year}`, seq })
    .onConflictDoUpdate({ target: counters.id, set: { seq: sql`max(${counters.seq}, ${seq})` } });
}

/** The scan id printed on the student card. Issued once and never changed. */
export function newQrCode(grade: number) {
  const hex = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `KEDA-${grade}-${hex}`;
}

/* --------------------------------------------------------------- validation */

/** Guardian numbers are local: ten digits starting with 0. */
export const isValidLocalPhone = (value: unknown): value is string => typeof value === "string" && /^0\d{9}$/.test(value.replace(/[\s-]/g, ""));
export const PHONE_ERROR = "Guardian phone must be a valid 10-digit number starting with 0 (e.g. 0701212234)";

/** A free-text field from a request. Tamil is stored with க்ஷ written apart (see keepLettersApart), however it was typed. */
export const text = (value: unknown, max: number) => (typeof value === "string" ? keepLettersApart(value.trim()).slice(0, max) : "");

export function parseDate(value: unknown): Date | null {
  if (!value || (typeof value !== "string" && typeof value !== "number")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A JSON body as a loose object, or null. Every field is validated where it is read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readBody(request: Request): Promise<Record<string, any> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/* -------------------------------------------------------------------- marks */

/**
 * A student's marks in the flat shape KCSC's screens read (subject, date and
 * maximum copied down from the exam). `marks` is 0 for an absent student —
 * always check `isAbsent` before treating it as a score.
 */
export async function marksForStudent(studentId: string) {
  const rows = await getDb()
    .select({ mark: M, exam: E })
    .from(M)
    .innerJoin(E, eq(M.examId, E.id))
    .where(eq(M.studentId, studentId))
    .orderBy(asc(E.examDate));
  return rows
    .map(({ mark, exam }) => ({
      _id: mark.id,
      studentId: mark.studentId,
      examId: exam.id,
      subject: exam.subject,
      examName: exam.name ?? undefined,
      examDate: exam.examDate.toISOString(),
      marks: mark.marks,
      isAbsent: mark.isAbsent,
      maxMarks: exam.maxMarks,
      grade: exam.grade,
      batchId: exam.batchId,
    }))
    .reverse();
}
