import { authorize } from "@/lib/auth/guard";
import { membershipSettingsError, normalizeMembershipSettings } from "@/lib/membership/rules";
import { getMembershipSettings, saveMembershipSettings } from "@/lib/membership/server";

/** Whether the club takes applications online, whether it charges, how much, and where the money goes. */
export async function GET() {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  return Response.json({ settings: await getMembershipSettings() });
}

export async function PUT(request: Request) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const error = membershipSettingsError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const settings = normalizeMembershipSettings(body);
  await saveMembershipSettings(settings);
  return Response.json({ settings });
}
