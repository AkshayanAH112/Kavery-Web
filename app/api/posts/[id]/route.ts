import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { sanitizePostHtml, htmlToText } from "@/lib/content/sanitize";
import { deleteMedia, getPost, isPostCategory, ownMedia, parseImages, announcePost, postDoc, readBody, text, uniquePostSlug } from "@/lib/content/server";

const P = schema.posts;
const NOT_FOUND = () => Response.json({ error: "Post not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/posts/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const post = await getPost((await params).id);
  return post ? Response.json({ post: postDoc(post) }) : NOT_FOUND();
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/posts/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const existing = await getPost((await params).id);
  if (!existing) return NOT_FOUND();

  const data = await readBody(request);
  const fail = (error: string) => Response.json({ error }, { status: 400 });
  if (!data) return fail("Invalid request");

  const db = getDb();
  const update: Partial<typeof P.$inferInsert> = {};
  const orphaned: (string | null | undefined)[] = [];

  if (data.title !== undefined) {
    const title = text(data.title, 160);
    if (!title) return fail("Title is required");
    if (title !== existing.title) {
      update.title = title;
      // A draft's address follows its title. A published post keeps the address people already shared.
      if (existing.status !== "published") update.slug = await uniquePostSlug(db, title, existing.id);
    }
  }
  if (data.content !== undefined) {
    const content = sanitizePostHtml(typeof data.content === "string" ? data.content.slice(0, 200_000) : "");
    if (!htmlToText(content)) return fail("Content is required");
    update.content = content;
  }
  if (data.excerpt !== undefined) update.excerpt = text(data.excerpt, 300) || null;
  if (data.org !== undefined) update.org = data.org === "keda" ? "keda" : "ksc";
  if (data.category !== undefined) {
    if (!isPostCategory(data.category)) return fail("Unknown category");
    update.category = data.category;
  }
  if (data.tags !== undefined) update.tags = Array.isArray(data.tags) ? data.tags.map((t: unknown) => text(t, 30)).filter(Boolean).slice(0, 12) : [];
  if (data.author !== undefined) update.author = text(data.author, 80) || existing.author;

  if (data.coverImageUrl !== undefined) {
    const cover = data.coverImageUrl ? ownMedia(data.coverImageUrl, data.coverImagePublicId, "news") : null;
    if (data.coverImageUrl && !cover) return fail("The cover image is not an upload from this site");
    if (existing.coverKey && existing.coverKey !== cover?.key) orphaned.push(existing.coverKey);
    update.coverUrl = cover?.url ?? null;
    update.coverKey = cover?.key ?? null;
  }
  if (data.images !== undefined) {
    const parsed = parseImages(data.images);
    if ("error" in parsed) return fail(parsed.error);
    const { images } = parsed;
    const kept = new Set(images.map((img) => img.key));
    orphaned.push(...existing.images.filter((img) => img.key && !kept.has(img.key)).map((img) => img.key));
    update.images = images;
  }

  if (data.status !== undefined) {
    update.status = data.status === "published" ? "published" : "draft";
    // Set once, on first publication. Editing a live post must not move it to the top of the feed.
    if (update.status === "published" && !existing.publishedAt) update.publishedAt = new Date();
  }

  const [post] = Object.keys(update).length ? await db.update(P).set(update).where(eq(P.id, existing.id)).returning() : [existing];
  await deleteMedia(orphaned);
  // Only the first time it goes public; editing or re-publishing a post must not notify again.
  if (update.publishedAt) announcePost(post);
  return Response.json({ post: postDoc(post) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/posts/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const post = await getPost((await params).id);
  if (!post) return NOT_FOUND();
  await getDb().delete(P).where(eq(P.id, post.id));
  await deleteMedia([post.coverKey, ...post.images.map((img) => img.key)]);
  return Response.json({ success: true });
}
