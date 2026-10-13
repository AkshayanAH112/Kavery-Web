/**
 * Database and storage helpers for club membership. As with the other modules,
 * the console screens read Mongo-shaped JSON, so rows are turned into that here.
 *
 * Two things in this file are load-bearing:
 *  - A member's photo and payment slips are PRIVATE. They are stored under
 *    folders that lib/media.ts does not list, so /media refuses to serve them
 *    and /api/upload refuses to write them. They are only ever read back through
 *    /api/members/[id]/file/[kind], which looks the key up from the member row —
 *    a client never names a storage key.
 *  - The fee is resolved here from the administrator's settings and the
 *    applicant's occupation category. A fee sent by a client is never read.
 */
import { and, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, getEnv, schema } from "@/lib/db";
import {
  computeAge,
  isJobCategory,
  isMinor,
  isNicRequired,
  isValidNic,
  isValidPhone,
  jobLabel,
  normalizeMembershipSettings,
  normalizeNic,
  normalizePhone,
  PHONE_ERROR,
  type JobCategory,
  type MembershipSettings,
  feeFor,
} from "./rules";

const { members: M, counters, siteSettings, users } = schema;

export type MemberRow = typeof M.$inferSelect;
export type MemberInsert = typeof M.$inferInsert;

export const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,64}$/.test(id);

/* ---------------------------------------------------------------- settings */

const SETTINGS_KEY = "membership";

export async function getMembershipSettings(): Promise<MembershipSettings> {
  const row = await getDb().query.siteSettings.findFirst({ where: eq(siteSettings.key, SETTINGS_KEY) });
  return normalizeMembershipSettings(row?.value);
}

export async function saveMembershipSettings(settings: MembershipSettings) {
  await getDb()
    .insert(siteSettings)
    .values({ key: SETTINGS_KEY, value: settings })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: settings, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------- files */

export const PRIVATE_FOLDERS = { photo: "members", slip: "payments" } as const;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** What the file really is, from its first bytes. The type a browser declares is only a claim. */
function sniff(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

type Stored = { ok: true; key: string } | { ok: false; error: string };

/** Checks and stores one private upload. A photo must be an image; a payment slip may also be a PDF. */
export async function storePrivateFile(file: File, kind: keyof typeof PRIVATE_FOLDERS, label: string): Promise<Stored> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: `${label} is larger than 4 MB. Choose a smaller file.` };
  const body = await file.arrayBuffer();
  const type = sniff(new Uint8Array(body, 0, Math.min(body.byteLength, 16)));
  if (!type || (kind === "photo" && type === "application/pdf")) {
    return { ok: false, error: kind === "photo" ? `${label} must be a JPEG, PNG or WebP image.` : `${label} must be a JPEG, PNG or WebP image, or a PDF.` };
  }
  const key = `${PRIVATE_FOLDERS[kind]}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${EXTENSIONS[type]}`;
  await getEnv().MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  return { ok: true, key };
}

/** Best-effort: a storage failure must never block the database change it follows. */
export async function deletePrivateFiles(keys: (string | null | undefined)[]) {
  const real = keys.filter((k): k is string => !!k);
  if (real.length) await getEnv().MEDIA.delete(real).catch(() => {});
}

/* ----------------------------------------------------------------- members */

export async function getMember(id: string) {
  return isId(id) ? ((await getDb().query.members.findFirst({ where: eq(M.id, id) })) ?? null) : null;
}

/** The card's member id. Issued once, on first approval, and never reused. */
export async function nextMemberCode() {
  const [row] = await getDb()
    .insert(counters)
    .values({ id: "membercode", seq: 1 })
    .onConflictDoUpdate({ target: counters.id, set: { seq: sql`${counters.seq} + 1` } })
    .returning({ seq: counters.seq });
  return `KSC-M-${String(row.seq).padStart(4, "0")}`;
}

/**
 * One adult, one membership: the same phone, email or NIC cannot be used twice.
 * Under-18s are exempt, because brothers and sisters apply with a parent's number.
 * The message deliberately does not say which detail matched.
 */
export async function findDuplicateMemberError(params: { age: number | null; email?: string | null; phone?: string | null; nic?: string | null; excludeId?: string }): Promise<string | null> {
  if (isMinor(params.age)) return null;
  const matches: SQL[] = [];
  if (params.phone) matches.push(eq(M.phone, params.phone));
  if (params.email) matches.push(eq(sql`lower(${M.email})`, params.email.toLowerCase()));
  if (params.nic) matches.push(eq(M.nic, params.nic));
  if (matches.length === 0) return null;
  const [existing] = await getDb()
    .select({ id: M.id })
    .from(M)
    .where(and(or(...matches), ne(M.status, "rejected"), params.excludeId ? ne(M.id, params.excludeId) : undefined))
    .limit(1);
  return existing ? "A membership or application with these details already exists. If that is a surprise, contact the club." : null;
}

const fileUrl = (id: string, kind: string) => `/api/members/${id}/file/${kind}`;

/** The shape the console screens read. Files are named by route, never by storage key. */
export function memberDoc(m: MemberRow, reviewerEmail?: string | null) {
  const renewal = m.renewalStatus === "pending" ? m.renewal : null;
  return {
    _id: m.id,
    fullName: m.fullName,
    dateOfBirth: m.dateOfBirth?.toISOString(),
    age: m.dateOfBirth ? computeAge(m.dateOfBirth) : undefined,
    gender: m.gender ?? undefined,
    phone: m.phone,
    whatsapp: m.whatsapp ?? undefined,
    email: m.email ?? undefined,
    address: m.address ?? undefined,
    nic: m.nic ?? undefined,
    guardianName: m.guardianName ?? undefined,
    guardianPhone: m.guardianPhone ?? undefined,
    photoUrl: m.photoKey ? fileUrl(m.id, "photo") : undefined,
    memberType: m.memberType ?? undefined,
    job: m.job ?? undefined,
    jobCategory: m.jobCategory ?? undefined,
    annualFee: m.annualFee ?? undefined,
    paymentSlipUrl: m.paymentSlipKey ? fileUrl(m.id, "slip") : undefined,
    validFrom: m.validFrom?.toISOString(),
    validUntil: m.validUntil?.toISOString(),
    renewalStatus: m.renewalStatus === "pending" ? "pending" : "none",
    renewalJob: renewal?.job,
    renewalAnnualFee: renewal?.annualFee,
    renewalPaymentSlipUrl: renewal?.slipKey ? fileUrl(m.id, "renewal-slip") : undefined,
    renewalSubmittedAt: renewal?.submittedAt ? new Date(renewal.submittedAt).toISOString() : undefined,
    memberCode: m.memberCode ?? undefined,
    interest: m.interest ?? undefined,
    previousClub: m.previousClub ?? undefined,
    message: m.message ?? undefined,
    status: m.status,
    reviewNotes: m.reviewNotes ?? undefined,
    reviewedBy: reviewerEmail ? { email: reviewerEmail } : null,
    reviewedAt: m.reviewedAt?.toISOString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export async function memberDocWithReviewer(m: MemberRow) {
  const reviewer = m.reviewedBy ? await getDb().query.users.findFirst({ where: eq(users.id, m.reviewedBy), columns: { email: true } }) : null;
  return memberDoc(m, reviewer?.email);
}

/* -------------------------------------------------------------- form input */

const field = (form: FormData, name: string, max: number) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};
const optional = (value: string) => value || null;

/** "2010-05-01" → that day (UTC). null when empty; "invalid" when not a real past date. */
export function parseDateOfBirth(value: string): Date | null | "invalid" {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "invalid";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "invalid";
  return date.getTime() < Date.now() && date.getUTCFullYear() >= 1900 ? date : "invalid";
}

/** Occupation → the fields stored on a member. The fee comes from settings, never from the request. */
export function occupationFields(form: FormData, settings: MembershipSettings): { ok: true; job: string; jobCategory: JobCategory; annualFee: number | null } | { ok: false; error: string } {
  const jobCategory = field(form, "jobCategory", 40);
  if (!isJobCategory(jobCategory)) return { ok: false, error: "Choose an occupation." };
  const jobOther = field(form, "jobOther", 80);
  if (jobCategory === "other" && !jobOther) return { ok: false, error: "Describe your occupation." };
  return { ok: true, job: jobCategory === "other" ? jobOther : jobLabel(jobCategory), jobCategory, annualFee: feeFor(settings, jobCategory) };
}

type Details = Pick<MemberInsert, "fullName" | "dateOfBirth" | "gender" | "phone" | "whatsapp" | "email" | "address" | "nic" | "guardianName" | "guardianPhone" | "memberType" | "interest" | "previousClub" | "message">;

/**
 * Reads and checks the personal details of a member from a form. `strict` is the
 * public form, where the applicant must supply what the club needs to review
 * them; an administrator typing in a paper form may leave gaps.
 */
export function memberDetails(form: FormData, strict: boolean): { ok: true; details: Details; age: number | null } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const fullName = field(form, "fullName", 120);
  if (!fullName) return fail("Enter the full name.");

  const phoneRaw = field(form, "phone", 30);
  if (!phoneRaw) return fail("Enter a phone number.");
  if (!isValidPhone(phoneRaw)) return fail(PHONE_ERROR);
  const whatsappRaw = field(form, "whatsapp", 30);
  if (whatsappRaw && !isValidPhone(whatsappRaw)) return fail("Enter the WhatsApp number in digits, for example 0771234567.");
  const guardianPhoneRaw = field(form, "guardianPhone", 30);
  if (guardianPhoneRaw && !isValidPhone(guardianPhoneRaw)) return fail("Enter the guardian's phone number in digits, for example 0771234567.");

  const dateOfBirth = parseDateOfBirth(field(form, "dateOfBirth", 10));
  if (dateOfBirth === "invalid") return fail("Enter a date of birth in the past.");
  if (strict && !dateOfBirth) return fail("Enter the date of birth.");
  const age = dateOfBirth ? computeAge(dateOfBirth) : null;

  const email = field(form, "email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, or leave it empty.");

  const nic = normalizeNic(field(form, "nic", 30));
  const guardianName = field(form, "guardianName", 120);
  const address = field(form, "address", 300);
  if (strict) {
    if (!address) return fail("Enter the address.");
    if (!nic && isNicRequired(age)) return fail("Enter the NIC number. It is only optional for applicants under 16.");
    if (nic && !isValidNic(nic)) return fail("Enter the NIC number as it is on the card: nine digits and V or X, or twelve digits.");
    if (isMinor(age) && (!guardianName || !guardianPhoneRaw)) return fail("Applicants under 18 need a parent or guardian's name and phone number.");
  }

  return {
    ok: true,
    age,
    details: {
      fullName,
      dateOfBirth,
      gender: optional(field(form, "gender", 20)),
      phone: normalizePhone(phoneRaw),
      whatsapp: whatsappRaw ? normalizePhone(whatsappRaw) : null,
      email: optional(email),
      address: optional(address),
      nic: optional(nic),
      guardianName: optional(guardianName),
      guardianPhone: guardianPhoneRaw ? normalizePhone(guardianPhoneRaw) : null,
      memberType: optional(field(form, "memberType", 60)),
      interest: optional(field(form, "interest", 200)),
      previousClub: optional(field(form, "previousClub", 120)),
      message: optional(field(form, "message", 1000)),
    },
  };
}

export const uploaded = (form: FormData, name: string): File | null => {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
};
