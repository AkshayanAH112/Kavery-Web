import { and, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getTest, paperRoster, papersOf, parseTestEdit, testDoc } from "@/lib/keda/exams";
import { deleteOnlinePapers } from "@/lib/keda/online";
import { paperStatus } from "@/lib/keda/online-rules";
import { getBatch, readBody, sortByIndexNumber, studentDoc, type StudentRow } from "@/lib/keda/server";
import { byPart, combineTest, paperLabel, round1 } from "@/lib/keda/test-results";
import { pushInBackground } from "@/lib/push";

const { tests: T, exams: E, marks: M, onlinePapers: OP } = schema;
const NOT_FOUND = () => Response.json({ error: "Test not found" }, { status: 404 });

async function load(id: unknown) {
  const test = await getTest(id);
  if (!test) return null;
  const papers = byPart(await papersOf([test.id]));
  const rosters = await Promise.all(papers.map((p) => paperRoster(p)));
  return { test, papers, rosters };
}

/** Papers with students on their roster who have neither a mark nor an absence entered. */
function unfinished(papers: Awaited<ReturnType<typeof load>> & {}) {
  return papers.papers
    .map((paper, i) => {
      const { students, marks } = papers.rosters[i];
      const recorded = new Set(marks.map((m) => m.studentId));
      return { paper, left: students.filter((s) => !recorded.has(s.id)).length };
    })
    .filter((p) => p.left > 0);
}

/** The test, its papers, and every student's parts, total and rank — the combined result table. */
export async function GET(_request: Request, { params }: RouteContext<"/api/tests/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const loaded = await load((await params).id);
  if (!loaded) return NOT_FOUND();
  const { test, papers, rosters } = loaded;

  const students = new Map<string, StudentRow>();
  for (const r of rosters) for (const s of r.students) students.set(s.id, s);
  const marks = rosters.flatMap((r) => r.marks);
  const { standings, ranked, classAverage, maxTotal } = combineTest(papers, marks, students.keys());
  const onRoster = rosters.map((r) => new Set(r.students.map((s) => s.id)));

  const [batch, online] = await Promise.all([getBatch(test.batchId), papers.length ? getDb().select().from(OP).where(inArray(OP.examId, papers.map((p) => p.id))) : []]);
  return Response.json({
    test: testDoc(test, papers, batch),
    papers: papers.map((p, i) => {
      const paper = online.find((o) => o.examId === p.id);
      return {
        _id: p.id,
        part: p.part,
        label: paperLabel(p),
        examDate: p.examDate.toISOString(),
        maxMarks: p.maxMarks,
        rosterCount: rosters[i].students.length,
        recorded: rosters[i].marks.length,
        online: paper ? { _id: paper.id, status: paperStatus(paper) } : null,
      };
    }),
    rows: sortByIndexNumber([...students.values()]).map((s) => {
      const standing = standings.get(s.id)!;
      return {
        student: { ...studentDoc(s, { brief: true }), school: s.school ?? null },
        // A part the student was never expected to sit (registered after its date) is not "missing".
        parts: standing.parts.map((p, i) => ({ ...p, expected: onRoster[i].has(s.id) })),
        total: standing.total,
        percent: standing.percent === null ? null : round1(standing.percent),
        rank: standing.rank,
        absent: standing.absent,
      };
    }),
    summary: { ranked, classAverage, maxTotal, unfinished: unfinished(loaded).map(({ paper, left }) => ({ label: paperLabel(paper), left })) },
  });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/tests/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const loaded = await load((await params).id);
  if (!loaded) return NOT_FOUND();
  const { test, papers } = loaded;

  const input = parseTestEdit(await readBody(request), test, papers);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  // Lowering a maximum below a mark already entered would leave a score above 100%.
  for (const edit of input.papers) {
    const paper = papers.find((p) => p.id === edit.id)!;
    if (edit.maxMarks === undefined || edit.maxMarks >= paper.maxMarks) continue;
    const entered = await db.select({ marks: M.marks }).from(M).where(and(eq(M.examId, paper.id), eq(M.isAbsent, false)));
    const highest = Math.max(0, ...entered.map((m) => m.marks));
    if (highest > edit.maxMarks) return Response.json({ error: `${paperLabel(paper)}: a mark of ${highest} is already entered, so the maximum cannot be lower than that.` }, { status: 409 });
  }

  // Parents get the whole test at once, so it is published only when every part is fully entered.
  const publishing = input.isPublished === true && !test.isPublished;
  if (publishing) {
    const left = unfinished(loaded);
    if (left.length > 0) {
      const detail = left.map(({ paper, left: n }) => `${paperLabel(paper)} has ${n} student${n === 1 ? "" : "s"} with no mark or absence entered`).join("; ");
      return Response.json({ error: `Not every mark is in yet: ${detail}.` }, { status: 409 });
    }
  }

  const testSet: Partial<typeof T.$inferInsert> = {};
  if (input.name !== undefined) testSet.name = input.name;
  if (input.isPublished !== undefined && input.isPublished !== test.isPublished) {
    testSet.isPublished = input.isPublished;
    testSet.publishedAt = input.isPublished ? new Date() : null;
  }
  const writes = [
    ...(Object.keys(testSet).length ? [db.update(T).set(testSet).where(eq(T.id, test.id))] : []),
    ...input.papers
      .map(({ id, ...set }) => ({ id, set }))
      .filter(({ set }) => Object.keys(set).length > 0)
      .map(({ id, set }) => db.update(E).set(set).where(eq(E.id, id))),
  ];
  if (writes.length) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);

  const [updated] = await db.select().from(T).where(eq(T.id, test.id));
  // Parents who asked for KEDA notices are told when results go public. It names the test, never a child.
  if (publishing) {
    pushInBackground("keda", { title: `Results published: ${updated.name}`, body: "Open the parent page to see your child's marks.", url: "/{locale}/parents", tag: `test-${updated.id}` });
  }
  return Response.json({ test: testDoc(updated, await papersOf([test.id])) });
}

/** Deletes the test, its papers, every mark on them, and any online paper set for them. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/tests/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const test = await getTest((await params).id);
  if (!test) return NOT_FOUND();
  const db = getDb();
  const paperIds = (await papersOf([test.id])).map((p) => p.id);
  if (paperIds.length) await deleteOnlinePapers((await db.select({ id: OP.id }).from(OP).where(inArray(OP.examId, paperIds))).map((p) => p.id));
  await db.batch([db.delete(M).where(inArray(M.examId, paperIds.length ? paperIds : [""])), db.delete(E).where(eq(E.testId, test.id)), db.delete(T).where(eq(T.id, test.id))]);
  return Response.json({ success: true });
}
