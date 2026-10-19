/**
 * The parent page: how a parent proves which child is theirs, and what they are
 * then shown.
 *
 * A parent gets in one of two ways, and no other:
 *  - with the student card — its QR code is the child's scan id, which is
 *    random and printed nowhere else; or
 *  - with the index number AND the phone number the child was registered with.
 *    The index number alone is not enough: index numbers run in sequence.
 *
 * Either way the answer to a wrong attempt is the same "no match", and what is
 * handed back is a signed cookie naming the child — the page itself never holds
 * the card code or the phone number.
 */
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, getSecret, schema } from "@/lib/db";
import { studentResults } from "@/lib/keda/results";
import type { StudentRow } from "@/lib/keda/server";
import { normalizePhone } from "@/lib/membership/rules";

const { students: S, attendance: A, classSessions: C, leaveAlerts: L, posts: P } = schema;

export const PARENT_COOKIE = "ksc_parent";
const MAX_AGE = 60 * 60 * 24 * 30;
/** Brothers and sisters: one phone can follow several children. */
const MAX_CHILDREN = 6;
// A parent token is its own kind: it carries no user id, so it can never pass as a staff session.
const AUDIENCE = "parent";

function secret() {
  const value = getSecret("AUTH_SECRET");
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters");
  return new TextEncoder().encode(value);
}

const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

async function readChildIds(): Promise<string[]> {
  const token = (await cookies()).get(PARENT_COOKIE)?.value;
  if (!token) return [];
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: AUDIENCE });
    return Array.isArray(payload.kids) ? payload.kids.filter((k): k is string => typeof k === "string").slice(0, MAX_CHILDREN) : [];
  } catch {
    return [];
  }
}

/** The children this browser may see — re-read each time, so a deactivated student disappears at once. */
export async function getParentChildren(): Promise<StudentRow[]> {
  const ids = await readChildIds();
  if (ids.length === 0) return [];
  const rows = await getDb().select().from(S).where(and(inArray(S.id, ids), eq(S.isActive, true)));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is StudentRow => !!r);
}

/** Adds a child to this browser's cookie (most recent first). */
export async function rememberChild(studentId: string) {
  const ids = [studentId, ...(await readChildIds()).filter((id) => id !== studentId)].slice(0, MAX_CHILDREN);
  const token = await new SignJWT({ kids: ids })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE)
    .sign(secret());
  (await cookies()).set(PARENT_COOKIE, token, cookieOptions(MAX_AGE));
}

export async function forgetChildren() {
  (await cookies()).set(PARENT_COOKIE, "", cookieOptions(0));
}

/* ------------------------------------------------------------------ sign-in */

/** The scan id from whatever the camera read. The card carries the bare id; anything around it is ignored. */
export function cardCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  const match = /KEDA-\d{1,2}-[0-9A-F]{8}/i.exec(value);
  return match ? match[0].toUpperCase() : null;
}

/** "keda / 27 / 1000" → "KEDA/27/1000"; anything else is not an index number. */
export function indexNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().replace(/\s+/g, "").toUpperCase().match(/^KEDA\/(\d{2})\/(\d{4,6})$/);
  return match ? `KEDA/${match[1]}/${match[2]}` : null;
}

export async function findByCard(code: string) {
  return (await getDb().query.students.findFirst({ where: and(eq(S.qrCode, code), eq(S.isActive, true)) })) ?? null;
}

/**
 * The phone must be one the child was registered with (the guardian's number or
 * the WhatsApp number). A student whose record has no phone yet — the ones
 * brought in from the spreadsheet — cannot be opened this way, only by card.
 */
export async function findByNumberAndPhone(registrationNumber: string, phone: string) {
  const student = await getDb().query.students.findFirst({ where: and(eq(S.registrationNumber, registrationNumber), eq(S.isActive, true)) });
  if (!student) return null;
  const given = normalizePhone(phone);
  const onFile = [student.guardianPhone, student.whatsapp].filter((p): p is string => !!p).map(normalizePhone);
  return given.length >= 7 && onFile.includes(given) ? student : null;
}

/* --------------------------------------------------------------- what is shown */

const RECENT_CLASSES = 12;

/** Marked classes only: a class nobody took the register for says nothing about the child. */
async function attendanceFor(student: StudentRow) {
  const rows = await getDb()
    .select({ present: A.present, date: A.date, subject: C.subject, time: C.time })
    .from(A)
    .innerJoin(C, eq(A.classId, C.id))
    .where(eq(A.studentId, student.id))
    .orderBy(desc(A.date));
  const present = rows.filter((r) => r.present).length;
  return {
    marked: rows.length,
    present,
    absent: rows.length - present,
    percent: rows.length ? Math.round((present / rows.length) * 100) : null,
    recent: rows.slice(0, RECENT_CLASSES).map((r) => ({ date: r.date.toISOString(), subject: r.subject ?? null, time: r.time ?? null, present: r.present })),
  };
}

type Notice = { kind: "leave"; date: string; leaveCount: number } | { kind: "result"; date: string; name: string };

/** Everything one child's parent sees. Assembled field by field; nothing from the family's own record goes back out. */
export async function childView(student: StudentRow) {
  const db = getDb();
  const [{ published, ...results }, attendance, alerts] = await Promise.all([studentResults(student), attendanceFor(student), db.select().from(L).where(eq(L.studentId, student.id)).orderBy(desc(L.createdAt)).limit(6)]);

  const notices: Notice[] = [
    ...alerts.map((a) => ({ kind: "leave" as const, date: a.createdAt.toISOString(), leaveCount: a.leaveCount })),
    ...published.map((t) => ({ kind: "result" as const, date: (t.publishedAt ?? t.createdAt).toISOString(), name: t.name })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return { ...results, attendance, notices };
}

/** KEDA's own published posts: the announcements every parent sees. */
export async function kedaAnnouncements(limit = 5) {
  const rows = await getDb()
    .select({ title: P.title, slug: P.slug, excerpt: P.excerpt, publishedAt: P.publishedAt })
    .from(P)
    .where(and(eq(P.status, "published"), eq(P.org, "keda")))
    .orderBy(desc(P.publishedAt))
    .limit(limit);
  return rows.map((r) => ({ title: r.title, slug: r.slug, excerpt: r.excerpt ?? null, publishedAt: r.publishedAt?.toISOString() ?? null }));
}
