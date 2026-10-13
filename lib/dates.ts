/**
 * Sri Lanka is UTC+5:30 with no daylight saving; Workers run in UTC. Any "today"
 * or day-range query must go through here — `new Date().setHours(0,0,0,0)` on the
 * server computes the wrong midnight and an evening class lands on the wrong day.
 */
const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** [start, end) of the Sri Lankan calendar day containing `at`. */
export function getDayRange(at: Date | number = Date.now()) {
  const local = new Date(at).getTime() + OFFSET_MS;
  const start = Math.floor(local / DAY_MS) * DAY_MS - OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

export const getTodayRange = () => getDayRange();

/** The Sri Lankan calendar year for `at`. */
export function getLocalYear(at: Date | number = Date.now()) {
  return new Date(new Date(at).getTime() + OFFSET_MS).getUTCFullYear();
}

/** The Sri Lankan calendar month for `at`, 0 = January. */
export function getLocalMonth(at: Date | number = Date.now()) {
  return new Date(new Date(at).getTime() + OFFSET_MS).getUTCMonth();
}

export const TIME_ZONE = "Asia/Colombo";
