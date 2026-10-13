import { and, desc, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { alertDoc, batchMap, studentDoc } from "@/lib/keda/server";

const { leaveAlerts: L, students: S } = schema;

/** Leave alerts: a parent warning at 2 leaves, an escalation at 3. */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams;
  const status = q.get("status");
  const type = q.get("type");
  const leaveCount = q.get("leaveCount");
  const db = getDb();
  const rows = await db
    .select()
    .from(L)
    .where(and(status && status !== "all" ? eq(L.status, status) : undefined, type && type !== "all" ? eq(L.type, type) : undefined, leaveCount ? eq(L.leaveCount, Number(leaveCount)) : undefined))
    .orderBy(desc(L.createdAt));

  if (q.get("expand") !== "student" || rows.length === 0) return Response.json({ notifications: rows.map((n) => alertDoc(n)) });

  const students = await db.select().from(S).where(inArray(S.id, [...new Set(rows.map((n) => n.studentId))]));
  const batches = await batchMap(students.map((s) => s.batchId));
  const studentById = new Map(students.map((s) => [s.id, studentDoc(s, { batch: s.batchId ? batches.get(s.batchId) : null })]));
  return Response.json({ notifications: rows.map((n) => alertDoc(n, studentById.get(n.studentId))) });
}
