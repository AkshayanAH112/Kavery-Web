/**
 * Club membership rules shared by the public forms, the console and the API.
 * No server imports, so client components can use it too.
 */
/**
 * What a member is: a school student, an undergraduate, or working — the three the fee can differ
 * by. "Working" is stored as `other`, its value from before it had a list of occupations, so the
 * fee settings and the members already saved keep meaning the same thing.
 */
export const JOB_CATEGORIES = [
  { value: "school_student", label: "School student" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "other", label: "Working" },
] as const;

/** A working member's occupation. `other` asks them to type it. The label is what is stored. */
export const OCCUPATIONS = [
  { value: "teacher", label: "Teacher" },
  { value: "government", label: "Government employee" },
  { value: "private", label: "Private sector employee" },
  { value: "business", label: "Business / self-employed" },
  { value: "farmer", label: "Farmer" },
  { value: "fisherman", label: "Fisherman" },
  { value: "driver", label: "Driver" },
  { value: "labourer", label: "Labourer" },
  { value: "health", label: "Doctor / nurse / health worker" },
  { value: "engineer", label: "Engineer / technician" },
  { value: "forces", label: "Police / armed forces" },
  { value: "abroad", label: "Working abroad" },
  { value: "other", label: "Other" },
] as const;
export type Occupation = (typeof OCCUPATIONS)[number]["value"];
export const isOccupation = (value: unknown): value is Occupation => typeof value === "string" && OCCUPATIONS.some((o) => o.value === value);
export type JobCategory = (typeof JOB_CATEGORIES)[number]["value"];

export function isJobCategory(value: unknown): value is JobCategory {
  return typeof value === "string" && JOB_CATEGORIES.some((c) => c.value === value);
}
export function jobLabel(category: JobCategory): string {
  return JOB_CATEGORIES.find((c) => c.value === category)!.label;
}

export const MEMBER_TYPES = ["Playing Member", "Non-Playing Member", "Junior Member", "Coach / Staff"] as const;
export const MEMBER_INTERESTS = ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"] as const;
export const GENDERS = ["Male", "Female", "Other"] as const;
export const MEMBER_STATUSES = ["pending", "approved", "rejected"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * What an administrator sets under Members → Fees and settings. Nothing about
 * money is in code: until someone switches the fee on and fills in the bank
 * details, joining is free and the forms ask for no payment slip.
 */
export type MembershipSettings = {
  /** Whether the public join and renew forms accept anything at all. */
  open: boolean;
  feeEnabled: boolean;
  currency: string;
  fees: Record<JobCategory, number>;
  bank: { accountName: string; bankName: string; branch: string; accountNumber: string };
};

export const DEFAULT_MEMBERSHIP_SETTINGS: MembershipSettings = {
  open: true,
  feeEnabled: false,
  currency: "LKR",
  fees: { school_student: 0, undergraduate: 0, other: 0 },
  bank: { accountName: "", bankName: "", branch: "", accountNumber: "" },
};

const MAX_FEE = 1_000_000;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const fee = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_FEE ? n : null;
};

/** Reads settings from anywhere (the database, a request body) field by field; anything odd falls back to the default. */
export function normalizeMembershipSettings(value: unknown): MembershipSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const fees = (v.fees && typeof v.fees === "object" ? v.fees : {}) as Record<string, unknown>;
  const bank = (v.bank && typeof v.bank === "object" ? v.bank : {}) as Record<string, unknown>;
  const d = DEFAULT_MEMBERSHIP_SETTINGS;
  return {
    open: typeof v.open === "boolean" ? v.open : d.open,
    feeEnabled: typeof v.feeEnabled === "boolean" ? v.feeEnabled : d.feeEnabled,
    currency: str(v.currency, 8) || d.currency,
    fees: {
      school_student: fee(fees.school_student) ?? d.fees.school_student,
      undergraduate: fee(fees.undergraduate) ?? d.fees.undergraduate,
      other: fee(fees.other) ?? d.fees.other,
    },
    bank: { accountName: str(bank.accountName, 120), bankName: str(bank.bankName, 80), branch: str(bank.branch, 80), accountNumber: str(bank.accountNumber, 40) },
  };
}

/** Why these settings cannot be saved, or null if they can. */
export function membershipSettingsError(value: unknown): string | null {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const fees = (v.fees && typeof v.fees === "object" ? v.fees : {}) as Record<string, unknown>;
  for (const c of JOB_CATEGORIES) {
    if (fees[c.value] !== undefined && fee(fees[c.value]) === null) return `The fee for "${c.label}" must be a whole number from 0 to ${MAX_FEE}.`;
  }
  const s = normalizeMembershipSettings(value);
  if (s.feeEnabled && (!s.bank.accountName || !s.bank.bankName || !s.bank.accountNumber)) {
    return "Fill in the account name, bank and account number before switching the fee on — applicants are shown these to pay into.";
  }
  return null;
}

/** The annual fee for a category, or null while the club charges nothing. */
export function feeFor(settings: MembershipSettings, category: JobCategory): number | null {
  return settings.feeEnabled ? settings.fees[category] : null;
}

export function oneYearFrom(date: Date): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Whole years between a date of birth and today. */
export function computeAge(dateOfBirth: Date | string, today = new Date()): number {
  const dob = new Date(dateOfBirth);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Younger than this is a date of birth typed wrong (a phone's date picker opens on today). */
export const MIN_MEMBER_AGE = 5;

/**
 * The date of birth a Sri Lankan NIC carries, as "YYYY-MM-DD", or null. Old cards are YYDDDnnnnV
 * (born 19YY), new ones YYYYDDDnnnnn. DDD is the day of the year, plus 500 for a woman, counted as if
 * every February had 29 days — so 060 is 29 February and 061 is always 1 March.
 */
export function nicBirthDate(value: string): string | null {
  const nic = normalizeNic(value);
  const parts = /^(\d{2})(\d{3})\d{4}[VX]$/.exec(nic) ?? /^(\d{4})(\d{3})\d{5}$/.exec(nic);
  if (!parts) return null;
  const year = parts[1].length === 2 ? 1900 + Number(parts[1]) : Number(parts[1]);
  let day = Number(parts[2]);
  if (day > 500) day -= 500;
  if (day < 1 || day > 366) return null;
  const inLeapYear = new Date(Date.UTC(2000, 0, day)); // 2000 has a 29 February, as the NIC's calendar does
  const date = new Date(Date.UTC(year, inLeapYear.getUTCMonth(), inLeapYear.getUTCDate()));
  // 29 February in a year that has none is not a real birthday.
  if (date.getUTCMonth() !== inLeapYear.getUTCMonth()) return null;
  return date.toISOString().slice(0, 10);
}

/** "Male" or "Female" from an NIC (the day of the year has 500 added for a woman), or null. */
export function nicGender(value: string): "Male" | "Female" | null {
  if (!nicBirthDate(value)) return null;
  const nic = normalizeNic(value);
  return Number(nic.length === 10 ? nic.slice(2, 5) : nic.slice(4, 7)) > 500 ? "Female" : "Male";
}

/** A national identity card is issued at 16, so younger applicants are not asked for one. */
export const isNicRequired = (age: number | null | undefined) => !(typeof age === "number" && age < 16);
/** Under 18: a guardian's name and number are needed, and siblings may share a phone. */
export const isMinor = (age: number | null | undefined) => typeof age === "number" && age < 18;

/** Spaces and dashes out; a Sri Lankan number written +94… or 94… becomes its 0… form so one person matches one number. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s()-]/g, "");
  if (/^\+94\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^94\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return digits;
}
export const isValidPhone = (value: string) => /^\+?\d{7,15}$/.test(normalizePhone(value));
export const PHONE_ERROR = "Enter the phone number in digits, for example 0771234567.";

export const normalizeNic = (value: string) => value.replace(/\s/g, "").toUpperCase();
/** Sri Lankan NIC: nine digits and V or X, or twelve digits. */
export const isValidNic = (value: string) => /^(\d{9}[VX]|\d{12})$/.test(normalizeNic(value));

export const isExpired = (validUntil: string | Date | null | undefined, now = new Date()) => !!validUntil && new Date(validUntil).getTime() < now.getTime();
