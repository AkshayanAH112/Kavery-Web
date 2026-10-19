import { authorize } from "@/lib/auth/guard";
import { getEnv } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/site";
import { normalizeSiteSettings, siteImageKeys, siteSettingsError } from "@/lib/site-settings";

/** Contact lines, the About page's text, the committees and the sponsors. */
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
  const before = siteImageKeys(await getSettings());
  await saveSettings(settings);

  // A photo or logo that was replaced or removed is deleted from storage once the change is saved.
  // (One uploaded but never saved stays behind; it is not linked from anywhere.)
  const after = siteImageKeys(settings);
  const unused = [...before].filter((key) => !after.has(key));
  if (unused.length) await getEnv().MEDIA.delete(unused).catch(() => {});
  return Response.json({ settings });
}
