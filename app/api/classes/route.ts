import { desc, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { classDoc, getBatch, isGrade, parseDate, readBody, text } from "@/lib/keda/server";

const C = schema.classSessions;

export async function GET(request: Request) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const batchId = new URL(request.url).searchParams.get("batchId");
  const rows = await getDb().select().from(C).where(batchId ? eq(C.batchId, batchId) : undefined).orderBy(desc(C.date));
  return Response.json({ classes: rows.map((c) => classDoc(c)) });
}

export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const batch = await getBatch(data?.batchId);
  if (!batch) return fail("Choose a batch for this class");
  const grade = Number(data?.grade);
  if (!isGrade(grade)) return fail("Choose the grade this class is for");
  const date = parseDate(data?.date);
  if (!date) return fail("Choose the date of the class");

  const [created] = await getDb().insert(C).values({ batchId: batch.id, grade, date, time: text(data?.time, 20) || null, subject: text(data?.subject, 80) || null }).returning();
  return Response.json({ class: classDoc(created) }, { status: 201 });
}
