/**
 * Client-safe rules for scheduled notifications: when the next one is due, and how
 * to say it. Everything is Sri Lanka time (UTC+5:30, no daylight saving), whatever
 * zone the Worker or the browser is in.
 */
import { z } from "zod";

export const REPEATS = ["once", "daily", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const REPEAT_LABELS: Record<Repeat, string> = { once: "Once", daily: "Every day", weekly: "Every week", monthly: "Every month" };
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A scheduled send that is this late is skipped, so nobody gets "practice at 4 pm" at 9 pm. */
export const LATE_LIMIT_MS = 30 * 60 * 1000;

const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ScheduleRule = z
  .object({
    repeat: z.enum(REPEATS),
    startDate: z.string().regex(DATE),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    dayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
    endDate: z.string().regex(DATE).nullable().default(null),
  })
  .refine((r) => r.repeat !== "weekly" || r.days.length > 0, { message: "Choose at least one day of the week." })
  .refine((r) => r.repeat !== "monthly" || r.dayOfMonth !== null, { message: "Choose the day of the month." })
  .refine((r) => r.repeat === "once" || !r.endDate || r.endDate >= r.startDate, { message: "The end date is before the start date." });
export type ScheduleRule = z.infer<typeof ScheduleRule>;

/** Today's date in Sri Lanka, as YYYY-MM-DD. */
export function colomboToday(at = Date.now()) {
  return new Date(at + OFFSET_MS).toISOString().slice(0, 10);
}

/** The moment a Sri Lanka date and HH:MM time fall on. */
export function colomboMoment(date: string, time: string) {
  return Date.parse(`${date}T${time}:00Z`) - OFFSET_MS;
}

function dayMatches(rule: ScheduleRule, date: Date) {
  if (rule.repeat === "daily") return true;
  if (rule.repeat === "weekly") return rule.days.includes(date.getUTCDay());
  if (rule.repeat === "monthly") {
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return date.getUTCDate() === Math.min(rule.dayOfMonth ?? 1, lastDay);
  }
  return false;
}

/**
 * The first time the rule fires strictly after `after`, or null when it never will
 * again (a one-off already past, or a repeat past its end date). A one-off whose
 * time has passed returns null too; callers decide whether that is "missed".
 */
export function nextRun(rule: ScheduleRule, after = Date.now()): number | null {
  if (rule.repeat === "once") {
    const at = colomboMoment(rule.startDate, rule.time);
    return at > after ? at : null;
  }
  const today = colomboToday(after);
  let day = new Date(`${rule.startDate > today ? rule.startDate : today}T00:00:00Z`);
  // Every rule fires at least once a month, so 32 days always finds it (allow a little more).
  for (let i = 0; i < 40; i++, day = new Date(day.getTime() + DAY_MS)) {
    const date = day.toISOString().slice(0, 10);
    if (rule.endDate && date > rule.endDate) return null;
    if (!dayMatches(rule, day)) continue;
    const at = colomboMoment(date, rule.time);
    if (at > after) return at;
  }
  return null;
}

function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

/** "Every Mon, Wed and Fri at 3 pm, until 31 Mar 2027" — for the console. */
export function describeRule(rule: Pick<ScheduleRule, "repeat" | "startDate" | "time" | "days" | "dayOfMonth" | "endDate">) {
  const at = clock(rule.time);
  let text: string;
  if (rule.repeat === "once") return `${shortDate(rule.startDate)} at ${at}`;
  if (rule.repeat === "daily") text = `Every day at ${at}`;
  else if (rule.repeat === "weekly") {
    const days = [...rule.days].sort().map((d) => (rule.days.length === 1 ? WEEKDAY_NAMES[d] : WEEKDAYS[d]));
    text = `Every ${days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : days[0]} at ${at}`;
  } else text = rule.dayOfMonth && rule.dayOfMonth > 28 ? `Monthly on the ${ordinal(rule.dayOfMonth)} (or the last day) at ${at}` : `Monthly on the ${ordinal(rule.dayOfMonth ?? 1)} at ${at}`;
  return rule.endDate ? `${text}, until ${shortDate(rule.endDate)}` : text;
}
