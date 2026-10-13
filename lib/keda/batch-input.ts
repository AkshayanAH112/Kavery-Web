import { GRADES, isGrade, text } from "./server";

/**
 * Validates a batch form body. With `partial`, only the fields present are
 * checked and returned (an edit); without it, name, year and grades are required.
 * A string is a message for the person filling in the form.
 */
export function parseBatch(data: Record<string, unknown> | null, partial = false) {
  if (!data) return "Invalid request";
  const out: { name?: string; year?: number; grades?: number[]; autoPromote?: boolean } = {};
  if (data.name !== undefined || !partial) {
    const name = text(data.name, 80);
    if (!name) return "Batch name is required";
    out.name = name;
  }
  if (data.year !== undefined || !partial) {
    const year = Number(data.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return "Enter the year as four digits, for example 2027";
    out.year = year;
  }
  if (data.grades !== undefined || !partial) {
    if (!Array.isArray(data.grades) || data.grades.length === 0 || !data.grades.every(isGrade)) return `Choose at least one grade (${GRADES.join(", ")})`;
    out.grades = [...new Set(data.grades as number[])].sort();
  }
  // Opt-in for the January rollover. Listing two grades does not imply it.
  if (data.autoPromote !== undefined) out.autoPromote = !!data.autoPromote;
  return out;
}
