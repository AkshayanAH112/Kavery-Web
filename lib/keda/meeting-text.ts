/**
 * The words of a missed-meetings reminder, in Tamil and in English. Client-safe:
 * the push notification, the WhatsApp message staff send and the parent page all
 * use these, so a family reads the same thing wherever it reaches them.
 */

export type NextMeeting = { date: string; time: string | null; venue: string | null };

const OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "Saturday 12 December", for a meeting's Sri Lanka date. */
function day(date: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(new Date(date).getTime() + OFFSET_MS));
}

/** "4:00 pm" */
function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "ஜனவரி 10 (ஞாயிறு)": month, day, then the weekday, as a date is said in Tamil. */
function tamilDay(date: string) {
  const parts = new Intl.DateTimeFormat("ta-LK", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).formatToParts(new Date(new Date(date).getTime() + OFFSET_MS));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")} ${part("day")} (${part("weekday")})`;
}

/** "மாலை 4:00 மணிக்கு": the part of the day in words, as said aloud, never AM/PM. */
function tamilClock(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const period = h < 12 ? "காலை" : h < 16 ? "பிற்பகல்" : h < 19 ? "மாலை" : "இரவு";
  return `${period} ${h % 12 || 12}:${String(m || 0).padStart(2, "0")} மணிக்கு`;
}

/** "Saturday, 12 December at 4:00 pm, Main hall" — or just the day. */
export function nextMeetingText(next: NextMeeting, locale: "ta" | "en") {
  if (locale === "ta") return `${tamilDay(next.date)}${next.time ? `, ${tamilClock(next.time)}` : ""}${next.venue ? `, ${next.venue}` : ""}`;
  return `${day(next.date)}${next.time ? ` at ${clock(next.time)}` : ""}${next.venue ? `, ${next.venue}` : ""}`;
}

export function reminderText({ name, missed, next }: { name: string; missed: number; next: NextMeeting | null }) {
  const ta = [
    `அன்புள்ள பெற்றோரே, ${name} தொடர்பான கடந்த ${missed} பெற்றோர் கூட்டங்களிலும் நீங்கள் கலந்துகொள்ளவில்லை.`,
    `தயவுசெய்து அடுத்த பெற்றோர் கூட்டத்தில் கட்டாயம் கலந்துகொள்ளுங்கள்.`,
    next ? `அடுத்த கூட்டம்: ${nextMeetingText(next, "ta")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const en = [
    `Dear parent, you did not attend the last ${missed} parent meetings for ${name}.`,
    `Please make sure you attend the next parent meeting.`,
    next ? `Next meeting: ${nextMeetingText(next, "en")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { ta, en };
}

export const REMINDER_TITLE = "பெற்றோர் கூட்டம் · Parent meeting";

/** The message staff send on WhatsApp: Tamil first, then English, signed by KEDA. */
export function whatsappMessage(text: { ta: string; en: string }) {
  return `${text.ta}\n\n${text.en}\n\n— KEDA, Kavery Sports Club`;
}

/** wa.me wants the number in international form without the plus: 0771234567 → 94771234567. */
export function whatsappNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `94${digits.slice(1)}`;
  if (/^94\d{9}$/.test(digits)) return digits;
  return digits.length >= 9 ? digits : null;
}
