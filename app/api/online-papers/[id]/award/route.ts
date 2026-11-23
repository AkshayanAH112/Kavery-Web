import { eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getPaper, questionsOf } from "@/lib/keda/online";
import { isFinished } from "@/lib/keda/online-rules";

const { onlineAttempts: OA, onlineAnswers: OAn } = schema;

/**
 * Staff marks for short answers: `[{ attemptId, questionId, awarded }]`. `awarded: null` clears a
 * mark, handing the answer back to the accepted-answer check. Only finished sittings are marked, and
 * the whole list saves or none of it does.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/online-papers/[id]/award">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return Response.json({ error: "Online paper not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const entries = (Array.isArray(body) ? body : [body]) as { attemptId?: unknown; questionId?: unknown; awarded?: unknown }[];
  const fail = (error: string) => Response.json({ error }, { status: 400 });
  if (entries.length === 0 || entries.length > 500 || entries.some((e) => !e || typeof e !== "object")) return fail("Send one mark or a list of marks");

  const db = getDb();
  const questions = await questionsOf(paper.id);
  const ids = [...new Set(entries.map((e) => String(e.attemptId)))];
  // D1 takes at most 100 values in one query: a long list reads the paper's sittings instead.
  const attempts = ids.length <= 90 ? await db.select().from(OA).where(inArray(OA.id, ids)) : await db.select().from(OA).where(eq(OA.paperId, paper.id));

  const rows: { attemptId: string; questionId: string; awarded: number | null }[] = [];
  for (const e of entries) {
    const attempt = attempts.find((a) => a.id === e.attemptId && a.paperId === paper.id);
    if (!attempt) return fail("That sitting is not on this paper");
    if (!isFinished(attempt)) return fail("A sitting can be marked once the student has finished");
    const question = questions.find((q) => q.id === e.questionId);
    if (!question || question.kind !== "short") return fail("Only short answers are marked by hand");
    const awarded = e.awarded === null ? null : Number(e.awarded);
    if (awarded !== null && (!Number.isFinite(awarded) || awarded < 0 || awarded > question.marks || Math.round(awarded * 2) !== awarded * 2)) {
      return fail(`Marks for that question must be between 0 and ${question.marks}, in whole or half marks`);
    }
    rows.push({ attemptId: attempt.id, questionId: question.id, awarded });
  }

  const writes = rows.map((r) => db.insert(OAn).values(r).onConflictDoUpdate({ target: [OAn.attemptId, OAn.questionId], set: { awarded: r.awarded } }));
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return Response.json({ success: true, count: rows.length });
}
