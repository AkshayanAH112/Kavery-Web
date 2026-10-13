/**
 * The details an administrator fills in under Site details: contact lines, what
 * the About page says about the club and about KEDA, and who the office bearers
 * are. Nothing here is invented by the code — an empty field simply does not
 * appear on the site. No server imports, so the console form can use it too.
 */
export type Bilingual = { en: string; ta: string };
export type Officer = { org: "ksc" | "keda"; role: string; name: string };

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
};
export type SiteSettings = typeof DEFAULT_SETTINGS;

const MAX_OFFICERS = 40;
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
        return { org: item.org === "keda" ? "keda" : "ksc", role: str(item.role, 80), name: str(item.name, 80) };
      })
      .filter((o) => o.role && o.name)
      .slice(0, MAX_OFFICERS),
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
  if (Array.isArray(v.officers) && v.officers.length > MAX_OFFICERS) return `No more than ${MAX_OFFICERS} office bearers can be listed.`;
  return null;
}

/** Free text an administrator typed → paragraphs. It is shown as text, never as HTML. */
export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
