import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { authorize } from "@/lib/auth/guard";
import { ownMedia } from "@/lib/content/server";
import { noticePath } from "@/lib/notices";
import { getPushOverview, isPushConfigured, sendPushToTopic } from "@/lib/push";
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
  return Response.json(await getPushOverview());
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

  // The row is written first: a notification with a poster opens that row's notice page.
  const db = getDb();
  const [entry] = await db
    .insert(schema.pushLog)
    .values({ topic, title, body, url, image: image?.url, imageKey: image?.key, sentBy: auth.session.userId })
    .returning({ id: schema.pushLog.id });

  const result = await sendPushToTopic(
    topic,
    image
      ? // The poster page carries the staff link as its "More details" button.
        { title, body, url: noticePath(entry.id), image: image.url, tag: `notice-${entry.id}` }
      : { title, body, url },
  );
  await db.update(schema.pushLog).set({ delivered: result.delivered, failed: result.failed }).where(eq(schema.pushLog.id, entry.id));
  return Response.json({ ...result, notice: image ? noticePath(entry.id, "en") : null });
}
