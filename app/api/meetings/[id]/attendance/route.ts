import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { NOT_FOUND } from "@/lib/keda/meeting-input";
import { getMeeting, isExpected, markParent, siblingsAt } from "@/lib/keda/meetings";
import { cardCode } from "@/lib/keda/parent";

const S = schema.students;

const Body = z.union([
  // A scan: the parent is here, for this child and any brother or sister at the same meeting.
  z.object({ qrCode: z.string().min(1).max(300) }),
  // A tap on the register: set one family either way.
  z.object({ studentId: z.string().min(1).max(64), present: z.boolean() }),
]);

export async function POST(request: Request, { params }: RouteContext<"/api/meetings/[id]/attendance">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const meeting = await getMeeting((await params).id);
  if (!meeting) return NOT_FOUND();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Scan a student card." }, { status: 400 });
  const db = getDb();

  if ("studentId" in parsed.data) {
    const [student] = await db.select().from(S).where(eq(S.id, parsed.data.studentId)).limit(1);
    if (!student) return Response.json({ error: "That student no longer exists." }, { status: 404 });
    await markParent(meeting, [student.id], parsed.data.present, auth.session.userId);
    return Response.json({ marked: [{ id: student.id, name: student.name }], present: parsed.data.present });
  }

  const raw = parsed.data.qrCode.trim();
  const code = cardCode(raw) ?? raw;
  const [student] = await db.select().from(S).where(eq(S.qrCode, code)).limit(1);
  if (!student) return Response.json({ error: "No student has this card." }, { status: 404 });
  if (!student.isActive) return Response.json({ error: `${student.name} is no longer an active student.` }, { status: 400 });
  if (!isExpected(meeting, student)) return Response.json({ error: `${student.name} (Grade ${student.grade}) is not part of this meeting.`, student: { id: student.id, name: student.name } }, { status: 400 });

  const { siblings, shared } = await siblingsAt(meeting, student);
  await markParent(meeting, [student.id, ...siblings.map((s) => s.id)], true, auth.session.userId);
  // `shared`: this guardian phone is on too many students to be one family, so only this child was marked.
  return Response.json({ marked: [student, ...siblings].map((s) => ({ id: s.id, name: s.name, grade: s.grade, registrationNumber: s.registrationNumber })), shared, present: true });
}
