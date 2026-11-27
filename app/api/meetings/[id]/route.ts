import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { INPUT_ERROR, MeetingInput, NOT_FOUND, meetingDocs, meetingValues } from "@/lib/keda/meeting-input";
import { endMeeting, getMeeting, meetingRegister } from "@/lib/keda/meetings";

const M = schema.parentMeetings;

/**
 * The meeting and its register. An attendance marker gets names and index
 * numbers only; the guardian's name and phone are for education staff.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/meetings/[id]">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const meeting = await getMeeting((await params).id);
  if (!meeting) return NOT_FOUND();
  const full = can(auth.session.role, "education.manage");
  const register = await meetingRegister(meeting);
  return Response.json({
    meeting: (await meetingDocs([meeting]))[0],
    register: register.map(({ student, status, markedAt }) => ({
      id: student.id,
      name: student.name,
      grade: student.grade,
      registrationNumber: student.registrationNumber,
      guardianName: full ? student.guardianName : undefined,
      guardianPhone: full ? student.guardianPhone : undefined,
      status,
      markedAt: markedAt?.getTime() ?? null,
    })),
  });
}

const End = z.object({ action: z.literal("end") });

/** `{ action: "end" }` closes the register; anything else is an edit of the meeting's details. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/meetings/[id]">) {
  const json = await request.json().catch(() => null);
  const ending = End.safeParse(json).success;
  const auth = await authorize(ending ? "attendance.mark" : "education.manage");
  if (!auth.ok) return auth.response;
  const meeting = await getMeeting((await params).id);
  if (!meeting) return NOT_FOUND();

  if (ending) return Response.json(await endMeeting(meeting, auth.session.userId));

  const parsed = MeetingInput.safeParse(json);
  if (!parsed.success) return INPUT_ERROR();
  const values = await meetingValues(parsed.data);
  if (!values) return Response.json({ error: "That batch no longer exists. Choose another." }, { status: 400 });
  const [updated] = await getDb().update(M).set(values).where(eq(M.id, meeting.id)).returning();
  return Response.json({ meeting: (await meetingDocs([updated]))[0] });
}

/** Deletes the meeting with its register and any reminders it raised. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/meetings/[id]">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const meeting = await getMeeting((await params).id);
  if (!meeting) return NOT_FOUND();
  await getDb().delete(M).where(eq(M.id, meeting.id));
  return Response.json({ ok: true });
}
