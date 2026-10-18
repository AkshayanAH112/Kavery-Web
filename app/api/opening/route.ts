import { authorize } from "@/lib/auth/guard";
import { closeSite, isOpened, openSite } from "@/lib/site";

const noStore = { "Cache-Control": "no-store" };

/** Public: the opening screen asks this every few seconds while it waits for the chief guest. */
export async function GET() {
  return Response.json({ open: await isOpened() }, { headers: noStore });
}

/** The "Open the website" button on the ceremony screen. */
export async function POST() {
  const auth = await authorize("site.manage");
  if (!auth.ok) return auth.response;
  await openSite();
  return Response.json({ open: true }, { headers: noStore });
}

/** Back to the opening screen, for a rehearsal. */
export async function DELETE() {
  const auth = await authorize("site.manage");
  if (!auth.ok) return auth.response;
  await closeSite();
  return Response.json({ open: false }, { headers: noStore });
}
