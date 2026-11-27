import { desc } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { INPUT_ERROR, MeetingInput, meetingDocs, meetingValues } from "@/lib/keda/meeting-input";

const M = schema.parentMeetings;

/** Every parent meeting, newest first. Attendance markers read it to choose the meeting they scan for. */
export async function GET() {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const rows = await getDb().select().from(M).orderBy(desc(M.date), desc(M.createdAt)).limit(60);
  return Response.json({ meetings: await meetingDocs(rows) });
}

export async function POST(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const parsed = MeetingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return INPUT_ERROR();
  const values = await meetingValues(parsed.data);
  if (!values) return Response.json({ error: "That batch no longer exists. Choose another." }, { status: 400 });
  const [created] = await getDb().insert(M).values(values).returning();
  return Response.json({ meeting: (await meetingDocs([created]))[0] }, { status: 201 });
}
