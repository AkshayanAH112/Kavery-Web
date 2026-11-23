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
import { getDb, schema } from "@/lib/db";
import {
  computeAge,
  isJobCategory,
  isMinor,
  isNicRequired,
  isOccupation,
  isValidNic,
  isValidPhone,
  jobLabel,
  MIN_MEMBER_AGE,
  nicBirthDate,
  normalizeMembershipSettings,
  normalizeNic,
  normalizePhone,
  OCCUPATIONS,
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

export { deletePrivateFiles, storePrivateFile } from "@/lib/private-files";

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
  const annualFee = feeFor(settings, jobCategory);
  if (jobCategory !== "other") return { ok: true, job: jobLabel(jobCategory), jobCategory, annualFee };
  // Working: an occupation from the list, or typed in. A form from before the list sends only the typed one.
  const occupation = field(form, "occupation", 40);
  if (isOccupation(occupation) && occupation !== "other") return { ok: true, job: OCCUPATIONS.find((o) => o.value === occupation)!.label, jobCategory, annualFee };
  if (!jobOther) return { ok: false, error: occupation ? "Describe your occupation." : "Choose your occupation." };
  return { ok: true, job: jobOther, jobCategory, annualFee };
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

  const nic = normalizeNic(field(form, "nic", 30));
  // The NIC carries the date of birth: it fills a date left out, and a date that disagrees is a typing slip.
  const fromNic = isValidNic(nic) ? nicBirthDate(nic) : null;
  const typed = field(form, "dateOfBirth", 10);
  const dateOfBirth = parseDateOfBirth(typed || fromNic || "");
  if (dateOfBirth === "invalid") return fail("Enter a date of birth in the past.");
  if (strict && !dateOfBirth) return fail("Enter the date of birth.");
  if (fromNic && typed && typed !== fromNic) return fail(`The date of birth does not match the NIC number, which gives ${fromNic}. Check both.`);
  const age = dateOfBirth ? computeAge(dateOfBirth) : null;
  if (age !== null && age < MIN_MEMBER_AGE) return fail(`Check the date of birth: it makes the member ${age} years old.`);

  const email = field(form, "email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, or leave it empty.");

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
