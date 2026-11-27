import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { deleteMedia, ownMedia } from "@/lib/content/server";
import { getDb, schema } from "@/lib/db";

/**
 * Edits or removes the notice page behind a notification that carried a poster.
 * A notification already shown on phones cannot be changed or recalled — only
 * the page it opens. The row stays in the send history either way.
 */
const L = schema.pushLog;
const NOT_FOUND = () => Response.json({ error: "That notice no longer exists." }, { status: 404 });

const Edit = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(240).optional(),
  // Same-site paths only, as when sending. Empty clears the "More details" button.
  url: z.union([z.literal(""), z.string().trim().regex(/^\/(?!\/)/).max(300)]).optional(),
  // A replacement poster uploaded to notices/ through /api/upload.
  image: z.object({ url: z.string().max(300), publicId: z.string().max(200) }).optional(),
});

async function findNotice(id: string) {
  const [row] = await getDb().select({ id: L.id, imageKey: L.imageKey }).from(L).where(and(eq(L.id, id), isNotNull(L.image))).limit(1);
  return row ?? null;
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/push/notices/[id]">) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  const notice = await findNotice((await params).id);
  if (!notice) return NOT_FOUND();

  const parsed = Edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Add a title, and make the link a path on this site (for example /en/news)." }, { status: 400 });
  const { title, body, url, image: imageInput } = parsed.data;

  const image = imageInput ? ownMedia(imageInput.url, imageInput.publicId, "notices") : null;
  if (imageInput && !image) return Response.json({ error: "That poster was not uploaded here. Choose it again." }, { status: 400 });

  await getDb()
    .update(L)
    .set({ title, body: body || null, url: url || null, ...(image ? { image: image.url, imageKey: image.key } : {}) })
    .where(eq(L.id, notice.id));
  // The old poster is only removed once nothing points at it.
  if (image && notice.imageKey !== image.key) await deleteMedia([notice.imageKey]);
  return Response.json({ ok: true });
}

/** Takes the notice page down and deletes its poster. The send stays in the history, without the poster. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/push/notices/[id]">) {
  const auth = await authorize("push.send");
  if (!auth.ok) return auth.response;
  const notice = await findNotice((await params).id);
  if (!notice) return NOT_FOUND();

  await getDb().update(L).set({ image: null, imageKey: null }).where(eq(L.id, notice.id));
  await deleteMedia([notice.imageKey]);
  return Response.json({ ok: true });
}
