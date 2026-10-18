import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Org } from "@/db/schema";
import { folderImages, getFolder } from "./server";

const { posts: P, galleryFolders: F, galleryImages: G } = schema;

/** What the public pages may read. Drafts and empty albums do not exist as far as these are concerned. */

/** "ksc" or "keda" from a query string; anything else means both. */
export const orgFilter = (value: unknown): Org | undefined => (value === "ksc" || value === "keda" ? value : undefined);

export async function getPublishedPosts(limit = 24, org?: Org) {
  return getDb().select().from(P).where(and(eq(P.status, "published"), org ? eq(P.org, org) : undefined)).orderBy(desc(P.publishedAt), desc(P.createdAt)).limit(limit);
}

export async function getPublishedPost(slug: string) {
  return (await getDb().query.posts.findFirst({ where: and(eq(P.slug, slug), eq(P.status, "published")) })) ?? null;
}

export async function getAlbums(org?: Org) {
  const db = getDb();
  const [folders, counts] = await Promise.all([db.select().from(F).where(and(isNotNull(F.coverUrl), org ? eq(F.org, org) : undefined)).orderBy(desc(F.createdAt)), db.select({ folderId: G.folderId, n: count() }).from(G).groupBy(G.folderId)]);
  const countBy = new Map(counts.map((c) => [c.folderId, c.n]));
  return folders.filter((f) => (countBy.get(f.id) ?? 0) > 0).map((f) => ({ ...f, imageCount: countBy.get(f.id) ?? 0 }));
}

/** A tile on the gallery page: an album, or a published news post's own photos. */
export type GalleryEntry = { kind: "album" | "post"; id: string; org: Org; slug: string | null; name: string; coverUrl: string; imageCount: number; date: number };

/** Albums and news posts with gallery photos, newest first. A post's tile opens the post at its photos. */
export async function getGallery(org?: Org): Promise<GalleryEntry[]> {
  const [albums, posts] = await Promise.all([
    getAlbums(org),
    getDb()
      .select({ id: P.id, org: P.org, slug: P.slug, title: P.title, coverUrl: P.coverUrl, images: P.images, publishedAt: P.publishedAt, createdAt: P.createdAt })
      .from(P)
      .where(and(eq(P.status, "published"), sql`json_array_length(${P.images}) > 0`, org ? eq(P.org, org) : undefined)),
  ]);
  const entries: GalleryEntry[] = [
    ...albums.map((a) => ({ kind: "album" as const, id: a.id, org: a.org, slug: null, name: a.name, coverUrl: a.coverUrl!, imageCount: a.imageCount, date: a.createdAt.getTime() })),
    ...posts.map((p) => ({ kind: "post" as const, id: p.id, org: p.org, slug: p.slug, name: p.title, coverUrl: p.coverUrl ?? p.images[0].url, imageCount: p.images.length, date: (p.publishedAt ?? p.createdAt).getTime() })),
  ];
  return entries.sort((a, b) => b.date - a.date);
}

export async function getAlbum(id: string) {
  const folder = await getFolder(id);
  if (!folder) return null;
  const images = await folderImages(getDb(), folder.id);
  return images.length ? { folder, images } : null;
}

/** Whether there is anything to link to — the About page only offers "KEDA news" and "KEDA photos" once there is. */
export async function getContentPresence() {
  const db = getDb();
  const [posts, photos, postsWithPhotos] = await Promise.all([
    db.$count(P, eq(P.status, "published")),
    db.$count(G),
    db.$count(P, and(eq(P.status, "published"), sql`json_array_length(${P.images}) > 0`)),
  ]);
  return { news: posts > 0, gallery: photos > 0 || postsWithPhotos > 0 };
}
