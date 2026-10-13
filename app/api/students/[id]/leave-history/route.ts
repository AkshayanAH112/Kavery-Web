import { and, eq, inArray } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { attendanceDoc, getStudent } from "@/lib/keda/server";

const { attendance: A, classSessions: C } = schema;

/** Every leave a student has taken, oldest first, dated by the class it was for. */
export async function GET(_request: Request, { params }: RouteContext<"/api/students/[id]/leave-history">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const student = await getStudent((await params).id);
  if (!student) return Response.json({ error: "Student not found" }, { status: 404 });

  const db = getDb();
  const rows = await db.select().from(A).where(and(eq(A.studentId, student.id), eq(A.countedAsLeave, true)));
  const sessions = rows.length ? await db.select().from(C).where(inArray(C.id, [...new Set(rows.map((r) => r.classId))])) : [];
  const sessionById = new Map(sessions.map((c) => [c.id, c]));

  const leaves = rows
    .map((row) => {
      const session = sessionById.get(row.classId);
      return { ...attendanceDoc(row, session), date: (session?.date ?? row.date).toISOString() };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return Response.json({ leaves });
}
