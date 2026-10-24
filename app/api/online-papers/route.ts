import { desc, eq, sql } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { paperDoc, parseNewPaper } from "@/lib/keda/online";
import { GRACE_MS } from "@/lib/keda/online-rules";
import { batchMap, readBody } from "@/lib/keda/server";

const { onlinePapers: OP, onlineAttempts: OA, exams: E } = schema;

/** Every online paper, newest first, with how many students have started and finished it. */
export async function GET() {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const db = getDb();
  const rows = await db.select({ paper: OP, testId: E.testId }).from(OP).leftJoin(E, eq(OP.examId, E.id)).orderBy(desc(OP.createdAt));
  if (rows.length === 0) return Response.json({ papers: [] });

  const now = Date.now();
  const [counts, batches] = await Promise.all([
    db
      .select({
        paperId: OA.paperId,
        started: sql<number>`count(*)`,
        finished: sql<number>`sum(case when ${OA.submittedAt} is not null or ${OA.deadline} < ${now - GRACE_MS} then 1 else 0 end)`,
      })
      .from(OA)
      .groupBy(OA.paperId),
    batchMap(rows.map((r) => r.paper.batchId)),
  ]);
  return Response.json({
    papers: rows.map(({ paper, testId }) => {
      const c = counts.find((x) => x.paperId === paper.id);
      return { ...paperDoc(paper, batches.get(paper.batchId)), testId, started: Number(c?.started ?? 0), finished: Number(c?.finished ?? 0) };
    }),
  });
}

/** `{ examId }` sets up the online paper for one paper of a test (or returns the one it has); `{ title, batchId, grade }` is a practice paper. */
export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const input = await parseNewPaper(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  if (input.examId) {
    const existing = await db.query.onlinePapers.findFirst({ where: eq(OP.examId, input.examId) });
    if (existing) return Response.json({ paper: paperDoc(existing) });
  }
  const [paper] = await db.insert(OP).values(input).returning();
  return Response.json({ paper: paperDoc(paper) }, { status: 201 });
}
