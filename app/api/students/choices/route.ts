import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";

const S = schema.students;

/** Most-used first, then alphabetical; one entry per spelling once spaces are tidied. */
function ranked(values: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw?.replace(/\s+/g, " ").trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 300).map(([v]) => v);
}

/**
 * The schools and addresses already on students' records, offered as choices
 * in the student forms. A new one typed into a form joins the list as soon as
 * that student is saved — there is no separate list to keep.
 */
export async function GET() {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const rows = await getDb().select({ school: S.school, address: S.address }).from(S);
  return Response.json({ schools: ranked(rows.map((r) => r.school)), addresses: ranked(rows.map((r) => r.address)) });
}
