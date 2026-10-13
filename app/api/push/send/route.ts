import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { authorize } from "@/lib/auth/guard";
import { getPushOverview, isPushConfigured, sendPushToTopic } from "@/lib/push";
import { PUSH_TOPICS } from "@/lib/push-topics";

const Body = z.object({
  topic: z.enum(PUSH_TOPICS),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(240).optional(),
  // Same-site paths only, so a notification can never send people to another site.
  url: z.string().trim().regex(/^\/(?!\/)/).max(300).optional(),
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

  const { topic, ...content } = parsed.data;
  const result = await sendPushToTopic(topic, content);
  await getDb().insert(schema.pushLog).values({
    topic,
    title: content.title,
    body: content.body,
    url: content.url,
    sentBy: auth.session.userId,
    delivered: result.delivered,
    failed: result.failed,
  });
  return Response.json(result);
}
