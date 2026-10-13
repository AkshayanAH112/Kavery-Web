import { desc, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { parseBatch } from "@/lib/keda/batch-input";
import { batchDoc, classDoc, getBatch, readBody } from "@/lib/keda/server";

const { batches: B, classSessions: C, students: S, exams: E } = schema;
const NOT_FOUND = () => Response.json({ error: "Batch not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/batches/[id]">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const batch = await getBatch((await params).id);
  if (!batch) return NOT_FOUND();
  const classes = await getDb().select().from(C).where(eq(C.batchId, batch.id)).orderBy(desc(C.date));
  return Response.json({ batch: batchDoc(batch), classes: classes.map((c) => classDoc(c)) });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/batches/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const batch = await getBatch((await params).id);
  if (!batch) return NOT_FOUND();
  const input = parseBatch(await readBody(request), true);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });
  const [updated] = Object.keys(input).length ? await getDb().update(B).set(input).where(eq(B.id, batch.id)).returning() : [batch];
  return Response.json({ batch: batchDoc(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/batches/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const batch = await getBatch((await params).id);
  if (!batch) return NOT_FOUND();

  const db = getDb();
  const [students, classes, exams] = await Promise.all([db.$count(S, eq(S.batchId, batch.id)), db.$count(C, eq(C.batchId, batch.id)), db.$count(E, eq(E.batchId, batch.id))]);
  if (students > 0 || classes > 0 || exams > 0) {
    return Response.json({ error: `Cannot delete: ${students} student(s), ${classes} class session(s), and ${exams} exam(s) still reference this batch` }, { status: 409 });
  }
  await db.delete(B).where(eq(B.id, batch.id));
  return Response.json({ success: true });
}
