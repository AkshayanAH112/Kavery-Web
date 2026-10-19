import { mediaUrl } from "@/lib/media";

/**
 * The details an administrator fills in under Site details: contact lines, what
 * the About page says about the club and about KEDA, who sits on the committees
 * (with photos) and who sponsors the club. Nothing here is invented by the code —
 * an empty field simply does not appear on the site. No server imports, so the
 * console form can use it too.
 */
export type Bilingual = { en: string; ta: string };
/** A committee member. `photoKey` is an R2 key in the public "site" folder, or "" for none. */
export type Officer = { org: "ksc" | "keda"; role: Bilingual; name: string; photoKey: string };
/** A sponsor, shown with its logo or picture on the About page. `url` is their own site, if any. */
export type Sponsor = { name: string; logoKey: string; url: string };
/** Someone the public can phone (or WhatsApp) about the club or about KEDA. */
export type Contact = { org: "ksc" | "keda"; name: string; phone: string };

/** These are the values until someone changes them. */
export const DEFAULT_SETTINGS = {
  contactEmail: "kedaperi23@gmail.com",
  contactPhone: "",
  address: "Periyaneelavanai, Sri Lanka",
  facebookUrl: "",
  kedaGrades: [4, 5] as number[],
  /** Free text for the About page, one paragraph per blank line. Empty = the site's standard wording. */
  aboutClub: { en: "", ta: "" } as Bilingual,
  aboutKeda: { en: "", ta: "" } as Bilingual,
  /** When and where KEDA's classes are held. */
  classInfo: { en: "", ta: "" } as Bilingual,
  officers: [] as Officer[],
  contacts: [] as Contact[],
  sponsors: [] as Sponsor[],
};
export type SiteSettings = typeof DEFAULT_SETTINGS;

const MAX_OFFICERS = 40;
const MAX_CONTACTS = 12;
const MAX_SPONSORS = 40;

/**
 * Only a key the upload route itself issues for the "site" folder is accepted, so a
 * saved photo can never point anywhere else (another folder, another site, a path).
 */
export const isSiteImageKey = (value: unknown): value is string => typeof value === "string" && /^site\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(value);
export const siteImageUrl = (key: string) => (key ? mediaUrl(key) : "");
/** Every uploaded picture these settings use, so ones that are no longer used can be deleted. */
export const siteImageKeys = (settings: SiteSettings) => new Set([...settings.officers.map((o) => o.photoKey), ...settings.sponsors.map((s) => s.logoKey)].filter(Boolean));
/** Digits with an optional leading +, as typed: "+94 77 352 3843" or "077 352 3843". */
const isPhone = (value: string) => /^\+?[\d\s-]{9,18}$/.test(value) && value.replace(/\D/g, "").length >= 9;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const bilingual = (value: unknown, max: number): Bilingual => {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { en: str(v.en, max), ta: str(v.ta, max) };
};
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Reads settings from anywhere (the database, a request body) field by field; anything odd falls back to the default. */
export function normalizeSiteSettings(value: unknown): SiteSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const grades = Array.isArray(v.kedaGrades) ? [...new Set(v.kedaGrades.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 13))].sort((a, b) => a - b) : [];
  const email = typeof v.contactEmail === "string" ? str(v.contactEmail, 254) : d.contactEmail;
  const facebook = str(v.facebookUrl, 300);
  return {
    contactEmail: email === "" || isEmail(email) ? email : d.contactEmail,
    contactPhone: str(v.contactPhone, 40),
    address: typeof v.address === "string" ? str(v.address, 200) : d.address,
    facebookUrl: isHttpsUrl(facebook) ? facebook : "",
    kedaGrades: grades.length ? grades : d.kedaGrades,
    aboutClub: bilingual(v.aboutClub, 4000),
    aboutKeda: bilingual(v.aboutKeda, 4000),
    classInfo: bilingual(v.classInfo, 600),
    officers: (Array.isArray(v.officers) ? v.officers : [])
      .map((o): Officer => {
        const item = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
        // Saved before roles had a Tamil version: the old single string is the English role.
        const role = typeof item.role === "string" ? { en: str(item.role, 80), ta: "" } : bilingual(item.role, 80);
        return { org: item.org === "keda" ? "keda" : "ksc", role, name: str(item.name, 80), photoKey: isSiteImageKey(item.photoKey) ? item.photoKey : "" };
      })
      .filter((o) => (o.role.en || o.role.ta) && o.name)
      .slice(0, MAX_OFFICERS),
    contacts: (Array.isArray(v.contacts) ? v.contacts : [])
      .map((c): Contact => {
        const item = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        return { org: item.org === "keda" ? "keda" : "ksc", name: str(item.name, 80), phone: str(item.phone, 24) };
      })
      .filter((c) => c.name && isPhone(c.phone))
      .slice(0, MAX_CONTACTS),
    sponsors: (Array.isArray(v.sponsors) ? v.sponsors : [])
      .map((x): Sponsor => {
        const item = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        const url = str(item.url, 300);
        return { name: str(item.name, 100), logoKey: isSiteImageKey(item.logoKey) ? item.logoKey : "", url: isHttpsUrl(url) ? url : "" };
      })
      .filter((x) => x.name)
      .slice(0, MAX_SPONSORS),
  };
}

/** Why these settings cannot be saved, or null if they can. */
export function siteSettingsError(value: unknown): string | null {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const email = str(v.contactEmail, 254);
  if (email && !isEmail(email)) return "Enter a valid contact email address, or leave it empty.";
  const facebook = str(v.facebookUrl, 300);
  if (facebook && !isHttpsUrl(facebook)) return "The Facebook link must start with https://";
  const validGrade = (g: unknown) => Number.isInteger(Number(g)) && Number(g) >= 1 && Number(g) <= 13;
  if (!Array.isArray(v.kedaGrades) || v.kedaGrades.length === 0 || !v.kedaGrades.every(validGrade)) return "Choose the grades KEDA teaches (whole numbers from 1 to 13, at least one).";
  if (Array.isArray(v.officers)) {
    if (v.officers.length > MAX_OFFICERS) return `No more than ${MAX_OFFICERS} committee members can be listed.`;
    for (const o of v.officers as Record<string, unknown>[]) {
      const role = o?.role && typeof o.role === "object" ? (o.role as Record<string, unknown>) : { en: o?.role };
      const hasRole = Boolean(str(role.en, 80) || str(role.ta, 80));
      const name = str(o?.name, 80);
      if (!name && !hasRole && !o?.photoKey) continue;
      if (!name) return "Every committee member needs a name.";
      if (!hasRole) return `Give ${name} a role, for example President.`;
    }
  }
  if (Array.isArray(v.sponsors)) {
    if (v.sponsors.length > MAX_SPONSORS) return `No more than ${MAX_SPONSORS} sponsors can be listed.`;
    for (const x of v.sponsors as Record<string, unknown>[]) {
      const name = str(x?.name, 100);
      const url = str(x?.url, 300);
      if (!name && !url && !x?.logoKey) continue;
      if (!name) return "Every sponsor needs a name.";
      if (url && !isHttpsUrl(url)) return `The link for ${name} must start with https://`;
    }
  }
  if (Array.isArray(v.contacts)) {
    if (v.contacts.length > MAX_CONTACTS) return `No more than ${MAX_CONTACTS} contact people can be listed.`;
    for (const c of v.contacts as Record<string, unknown>[]) {
      const name = str(c?.name, 80);
      const phone = str(c?.phone, 24);
      if (!name && !phone) continue;
      if (!name) return "Every contact person needs a name.";
      if (!isPhone(phone)) return `The phone number for ${name} is not valid. Use digits, for example +94 77 123 4567 or 077 123 4567.`;
    }
  }
  return null;
}

/** A number for wa.me: digits only, with Sri Lanka's 94 in place of a leading 0. */
export const whatsappNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
};

/** Free text an administrator typed → paragraphs. It is shown as text, never as HTML. */
export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
