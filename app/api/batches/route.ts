import { desc } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { parseBatch } from "@/lib/keda/batch-input";
import { batchDoc, readBody } from "@/lib/keda/server";

// Readable by anyone who marks attendance (the scanner picks a class by batch); only managers change them.
export async function GET() {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const rows = await getDb().select().from(schema.batches).orderBy(desc(schema.batches.createdAt));
  return Response.json({ batches: rows.map(batchDoc) });
}

export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const input = parseBatch(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });
  const [batch] = await getDb().insert(schema.batches).values({ name: input.name!, year: input.year!, grades: input.grades!, autoPromote: input.autoPromote ?? false }).returning();
  return Response.json({ batch: batchDoc(batch) }, { status: 201 });
}
