import { and, eq, sql } from "drizzle-orm";
import { getLocalYear } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { GRADES } from "./server";

const { batches: B, students: S, counters } = schema;

export type Promotion = { batchId: string; batchName: string; fromGrade: number; toGrade: number; promotedCount: number };

/**
 * The yearly grade rollover: in batches that opted in (`autoPromote`), active
 * students move up one grade and start a fresh leave cycle. Same student
 * record, same index number, same QR card.
 *
 * Two things here differ from the job this was ported from, both on purpose:
 *
 *  - Grades are moved highest first. Going lowest first promotes Grade 3 to 4
 *    and then, in the same run, promotes those same students again from 4 to 5.
 *  - Each batch is stamped once it has been promoted for the year, and a
 *    stamped batch is skipped. Without that, running the job twice in January
 *    moves everyone up twice.
 */
export async function promoteStudents(now: Date = new Date()): Promise<{ year: number; promotions: Promotion[]; alreadyDone: string[] }> {
  const db = getDb();
  const year = getLocalYear(now);
  const batches = await db.select().from(B).where(eq(B.autoPromote, true));
  const promotions: Promotion[] = [];
  const alreadyDone: string[] = [];

  for (const batch of batches) {
    // The stamp is taken first: only the run that creates it goes on to promote.
    const stamp = await db.insert(counters).values({ id: `promoted-${batch.id}-${year}`, seq: 1 }).onConflictDoNothing().returning({ id: counters.id });
    if (stamp.length === 0) {
      alreadyDone.push(batch.name);
      continue;
    }

    const grades = [...batch.grades].sort((a, b) => b - a);
    for (const toGrade of grades) {
      const fromGrade = toGrade - 1;
      if (!(GRADES as readonly number[]).includes(fromGrade) || !batch.grades.includes(fromGrade)) continue;
      const moved = await db
        .update(S)
        .set({ grade: toGrade, currentLeaveCycle: 0, cycleGeneration: sql`${S.cycleGeneration} + 1` })
        .where(and(eq(S.batchId, batch.id), eq(S.grade, fromGrade), eq(S.isActive, true)))
        .returning({ id: S.id });
      if (moved.length > 0) promotions.push({ batchId: batch.id, batchName: batch.name, fromGrade, toGrade, promotedCount: moved.length });
    }
  }
  return { year, promotions, alreadyDone };
}
