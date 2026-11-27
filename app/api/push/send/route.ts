import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { ownMedia } from "@/lib/content/server";
import { isPushConfigured, sendAndLog } from "@/lib/push";
import { getPushConsole } from "@/lib/push-schedules";
import { PUSH_TOPICS } from "@/lib/push-topics";

const Body = z.object({
  topic: z.enum(PUSH_TOPICS),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(240).optional(),
  // Same-site paths only, so a notification can never send people to another site.
  url: z.string().trim().regex(/^\/(?!\/)/).max(300).optional(),
  // A poster uploaded to notices/ through /api/upload. Checked with ownMedia() below.
  image: z.object({ url: z.string().max(300), publicId: z.string().max(200) }).optional(),
});

export async function GET() {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  return Response.json(await getPushConsole());
}

export async function POST(request: Request) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Add a title, and make the link a path on this site (for example /en)." }, { status: 400 });
  if (!isPushConfigured()) return Response.json({ error: "Push keys are not set on this deployment yet." }, { status: 503 });

  const { topic, title, body, url, image: imageInput } = parsed.data;
  const image = imageInput ? ownMedia(imageInput.url, imageInput.publicId, "notices") : null;
  if (imageInput && !image) return Response.json({ error: "That poster was not uploaded here. Choose it again." }, { status: 400 });

  const result = await sendAndLog({ topic, title, body, url, poster: image, sentBy: auth.session.userId });
  return Response.json({ ...result, logId: undefined });
}
