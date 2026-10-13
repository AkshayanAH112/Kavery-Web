import { and, desc, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { sanitizePostHtml, htmlToText } from "@/lib/content/sanitize";
import { isPostCategory, ownMedia, parseImages, announcePost, postDoc, readBody, text, uniquePostSlug } from "@/lib/content/server";

const P = schema.posts;

export async function GET(request: Request) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams;
  const status = q.get("status");
  const category = q.get("category");
  const rows = await getDb()
    .select()
    .from(P)
    .where(and(status === "draft" || status === "published" ? eq(P.status, status) : undefined, isPostCategory(category) ? eq(P.category, category) : undefined))
    .orderBy(desc(P.updatedAt));
  return Response.json({ posts: rows.map(postDoc) });
}

export async function POST(request: Request) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const fail = (error: string) => Response.json({ error }, { status: 400 });
  const title = text(data?.title, 160);
  if (!title) return fail("Title is required");
  const content = sanitizePostHtml(typeof data?.content === "string" ? data.content.slice(0, 200_000) : "");
  if (!htmlToText(content)) return fail("Content is required");

  const images = data?.images === undefined ? [] : parseImages(data.images);
  if (!images) return fail("One of the images is not an upload from this site");
  const cover = data?.coverImageUrl ? ownMedia(data.coverImageUrl, data.coverImagePublicId, "news") : null;
  if (data?.coverImageUrl && !cover) return fail("The cover image is not an upload from this site");

  const db = getDb();
  const published = data?.status === "published";
  const [post] = await db
    .insert(P)
    .values({
      org: data?.org === "keda" ? "keda" : "ksc",
      title,
      slug: await uniquePostSlug(db, title),
      excerpt: text(data?.excerpt, 300) || null,
      content,
      coverUrl: cover?.url ?? null,
      coverKey: cover?.key ?? null,
      images,
      category: isPostCategory(data?.category) ? data.category : "news",
      tags: Array.isArray(data?.tags) ? data.tags.map((t: unknown) => text(t, 30)).filter(Boolean).slice(0, 12) : [],
      status: published ? "published" : "draft",
      author: text(data?.author, 80) || auth.session.name,
      publishedAt: published ? new Date() : null,
    })
    .returning();
  if (published) announcePost(post);
  return Response.json({ post: postDoc(post) }, { status: 201 });
}
