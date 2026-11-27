import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { colomboMoment } from "@/lib/push-schedule";
import { keepLettersApart } from "@/lib/keda/bamini";
import { GRADES } from "@/lib/keda/server";
import { expectedStudents, meetingCounts, type MeetingRow } from "@/lib/keda/meetings";

const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => keepLettersApart(v));

/** What the console sends to create or edit a parent meeting. */
export const MeetingInput = z.object({
  title: clean(100).pipe(z.string().min(1)),
  batchId: z.string().max(64).nullable(),
  grade: z
    .number()
    .int()
    .refine((g) => (GRADES as readonly number[]).includes(g))
    .nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  venue: clean(100).nullable(),
  notes: clean(500).nullable(),
});
export type MeetingInput = z.infer<typeof MeetingInput>;

export const INPUT_ERROR = () => Response.json({ error: "Add a title and the date of the meeting." }, { status: 400 });
export const NOT_FOUND = () => Response.json({ error: "That meeting no longer exists." }, { status: 404 });

/** The row values from validated input, or an error when the batch does not exist. */
export async function meetingValues(input: MeetingInput) {
  if (input.batchId) {
    const [batch] = await getDb().select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.id, input.batchId)).limit(1);
    if (!batch) return null;
  }
  return {
    title: input.title,
    batchId: input.batchId,
    grade: input.grade,
    date: new Date(colomboMoment(input.date, "00:00")),
    time: input.time,
    venue: input.venue || null,
    notes: input.notes || null,
  };
}

/** A meeting as the console screens read it. */
export async function meetingDocs(meetings: MeetingRow[]) {
  const db = getDb();
  const [counts, batches] = await Promise.all([meetingCounts(meetings), db.select({ id: schema.batches.id, name: schema.batches.name }).from(schema.batches)]);
  const expected = await Promise.all(meetings.map((m) => (m.endedAt ? Promise.resolve(null) : expectedStudents(m).then((s) => s.length))));
  return meetings.map((m, i) => {
    const c = counts.get(m.id) ?? { present: 0, absent: 0 };
    return {
      id: m.id,
      title: m.title,
      batchId: m.batchId,
      batchName: batches.find((b) => b.id === m.batchId)?.name ?? null,
      grade: m.grade,
      date: m.date.toISOString(),
      time: m.time,
      venue: m.venue,
      notes: m.notes,
      endedAt: m.endedAt?.toISOString() ?? null,
      present: c.present,
      absent: c.absent,
      // Before the end, how many families are expected; after it, everyone has a mark.
      expected: expected[i] ?? c.present + c.absent,
    };
  });
}
export type MeetingDoc = Awaited<ReturnType<typeof meetingDocs>>[number];
