import { authorize } from "@/lib/auth/guard";
import { getSettings, saveSettings } from "@/lib/site";
import { normalizeSiteSettings, siteSettingsError } from "@/lib/site-settings";

/** Contact lines, the About page's text and the office bearers. */
export async function GET() {
  const auth = await authorize("site.manage");
  if (!auth.ok) return auth.response;
  return Response.json({ settings: await getSettings() });
}

export async function PUT(request: Request) {
  const auth = await authorize("site.manage");
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const error = siteSettingsError(body);
  if (error) return Response.json({ error }, { status: 400 });
  const settings = normalizeSiteSettings(body);
  await saveSettings(settings);
  return Response.json({ settings });
}
