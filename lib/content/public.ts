import { and, count, desc, eq, isNotNull } from "drizzle-orm";
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

export async function getAlbum(id: string) {
  const folder = await getFolder(id);
  if (!folder) return null;
  const images = await folderImages(getDb(), folder.id);
  return images.length ? { folder, images } : null;
}

/** Whether there is anything to link to — the site navigation only offers News and Gallery once there is. */
export async function getContentPresence() {
  const db = getDb();
  const [posts, photos] = await Promise.all([db.$count(P, eq(P.status, "published")), db.$count(G)]);
  return { news: posts > 0, gallery: photos > 0 };
}
