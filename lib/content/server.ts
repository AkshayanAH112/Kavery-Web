/**
 * Database-side helpers for news posts and gallery albums. As with the other
 * ported modules, the console screens read Mongo-shaped JSON, so rows are turned
 * into those shapes here.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb, getEnv, schema, type Db } from "@/lib/db";
import type { ContentImage } from "@/db/schema";
import { MAX_POST_IMAGES, MEDIA_FOLDERS } from "@/lib/media";
import { slugify } from "@/lib/slug";
import { pushInBackground } from "@/lib/push";

const { posts: P, galleryFolders: F, galleryImages: G } = schema;

export type PostRow = typeof P.$inferSelect;
export type FolderRow = typeof F.$inferSelect;
export type ImageRow = typeof G.$inferSelect;

export { POST_CATEGORIES, isPostCategory, type PostCategory } from "@/lib/post-categories";

export const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,64}$/.test(id);
export const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readBody(request: Request): Promise<Record<string, any> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/* ------------------------------------------------------------------- media */

/**
 * An uploaded file as the client names it: the URL we served it at and its R2
 * key. Both are checked — the URL must be one of ours and the key must sit in
 * the folder this content type uploads to. Without that, a saved post could
 * hot-link any address, and "delete this image" could be pointed at any object
 * in the bucket.
 */
export function ownMedia(url: unknown, key: unknown, folder: "news" | "gallery"): { url: string; key: string } | null {
  if (typeof url !== "string" || typeof key !== "string") return null;
  if (!MEDIA_FOLDERS[folder] || !new RegExp(`^${folder}/\\d{4}/[\\w-]+\\.(jpg|png|webp)$`).test(key)) return null;
  return url === `/media/${key}` ? { url, key } : null;
}

/** Best-effort: a storage failure must never block the database change it follows. */
export async function deleteMedia(keys: (string | null | undefined)[]) {
  const real = keys.filter((k): k is string => !!k);
  if (real.length) await getEnv().MEDIA.delete(real).catch(() => {});
}

/* ------------------------------------------------------------------- posts */

/**
 * A newly published post is pushed to whoever asked for that kind of news:
 * KEDA's posts are the announcements parents follow; the club's go to "news".
 */
export function announcePost(post: PostRow) {
  pushInBackground(post.org === "keda" ? "keda" : "news", { title: post.title, body: post.excerpt ?? undefined, url: `/{locale}/news/${post.slug}`, tag: `post-${post.id}` });
}

export const postDoc = (p: PostRow) => ({
  _id: p.id,
  org: p.org,
  title: p.title,
  slug: p.slug,
  excerpt: p.excerpt ?? undefined,
  content: p.content,
  coverImageUrl: p.coverUrl ?? undefined,
  coverImagePublicId: p.coverKey ?? undefined,
  images: p.images.map((img) => ({ url: img.url, publicId: img.key, caption: img.caption })),
  category: p.category,
  tags: p.tags,
  status: p.status,
  author: p.author,
  publishedAt: p.publishedAt?.toISOString(),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

export async function getPost(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.posts.findFirst({ where: eq(P.id, id) })) ?? null;
}

/** Titles repeat year to year ("Annual prize giving"), so a clash gets a number. `excludeId` lets an edit keep its own slug. */
export async function uniquePostSlug(db: Db, title: string, excludeId?: string) {
  const base = slugify(title) || "post";
  let candidate = base;
  let n = 2;
  while ((await db.$count(P, and(eq(P.slug, candidate), excludeId ? ne(P.id, excludeId) : undefined))) > 0) candidate = `${base}-${n++}`;
  return candidate;
}

/** A post's gallery as the client sent it, or why it is refused. */
export function parseImages(value: unknown): { images: ContentImage[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "The gallery images were not sent as a list" };
  if (value.length > MAX_POST_IMAGES) return { error: `A post can have at most ${MAX_POST_IMAGES} gallery images. Put the rest in a gallery album.` };
  const images: ContentImage[] = [];
  for (const item of value) {
    const media = ownMedia(item?.url, item?.publicId, "news");
    if (!media) return { error: "One of the images is not an upload from this site" };
    images.push({ ...media, caption: text(item?.caption, 200) || undefined });
  }
  return { images };
}

/* ----------------------------------------------------------------- gallery */

export const imageDoc = (g: ImageRow) => ({ _id: g.id, url: g.url, publicId: g.key ?? undefined, caption: g.caption ?? undefined, createdAt: g.createdAt.toISOString() });

export const folderDoc = (f: FolderRow, images: ImageRow[]) => ({
  _id: f.id,
  org: f.org,
  name: f.name,
  coverImageUrl: f.coverUrl ?? undefined,
  coverImagePublicId: f.coverKey ?? undefined,
  images: images.map(imageDoc),
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
});

export async function getFolder(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.galleryFolders.findFirst({ where: eq(F.id, id) })) ?? null;
}

/** An album's photos, newest first. */
export async function folderImages(db: Db, folderId: string) {
  const rows = await db.select().from(G).where(eq(G.folderId, folderId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
}
