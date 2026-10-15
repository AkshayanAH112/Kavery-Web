import type { MetadataRoute } from "next";
import { desc, eq, isNotNull, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const BASE = "https://periyaneelavanaikaverysports.club";
const { posts: P, galleryFolders: F, galleryImages: G, cricketMatches: M, siteSettings: S } = schema;

/**
 * Every public page, in English and Tamil, each naming its other-language twin.
 *
 * `lastModified` is only ever a date the database recorded for what the page
 * shows; a page with no such date has none. Google uses lastmod only while it
 * stays accurate, so "now" on every request would make it ignore the field.
 * changefreq and priority are left out: Google ignores both.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: Date | null) => {
    for (const locale of ["en", "ta"] as const) {
      entries.push({
        url: `${BASE}/${locale}${path}`,
        ...(lastModified ? { lastModified } : {}),
        alternates: { languages: { en: `${BASE}/en${path}`, ta: `${BASE}/ta${path}`, "x-default": `${BASE}/en${path}` } },
      });
    }
  };
  const latest = (...dates: (Date | null | undefined)[]) => dates.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

  try {
    const db = getDb();
    const [posts, folders, photos, matches, settings] = await Promise.all([
      db.select({ slug: P.slug, publishedAt: P.publishedAt, updatedAt: P.updatedAt }).from(P).where(eq(P.status, "published")).orderBy(desc(P.publishedAt)).limit(200),
      db.select({ id: F.id, updatedAt: F.updatedAt }).from(F).where(isNotNull(F.coverUrl)),
      // An album's page changes when a photo is added, which does not touch the album row.
      db.select({ folderId: G.folderId, added: max(G.createdAt) }).from(G).groupBy(G.folderId),
      db.select({ id: M.id, updatedAt: M.updatedAt }).from(M).where(eq(M.isPublished, true)).orderBy(desc(M.updatedAt)).limit(100),
      db.select({ key: S.key, updatedAt: S.updatedAt }).from(S),
    ]);

    const lastPhoto = new Map(photos.map((p) => [p.folderId, p.added]));
    // The public gallery shows only albums with photos; an empty one would be a "not found" page.
    const albums = folders.filter((f) => lastPhoto.has(f.id)).map((f) => ({ id: f.id, at: latest(f.updatedAt, lastPhoto.get(f.id)) }));
    const postDates = posts.map((p) => ({ slug: p.slug, at: latest(p.updatedAt, p.publishedAt) }));
    const membership = settings.find((s) => s.key === "membership")?.updatedAt;
    const siteDetails = latest(...settings.filter((s) => s.key !== "membership").map((s) => s.updatedAt));
    const newsAt = latest(...postDates.map((p) => p.at));
    const galleryAt = latest(...albums.map((a) => a.at));
    const liveAt = latest(...matches.map((m) => m.updatedAt));

    add("", latest(newsAt, galleryAt, liveAt, siteDetails));
    add("/about", siteDetails);
    add("/news", newsAt);
    add("/gallery", galleryAt);
    add("/membership", membership);
    add("/membership/renew", membership);
    add("/live", liveAt);
    for (const p of postDates) add(`/news/${p.slug}`, p.at);
    for (const a of albums) add(`/gallery/${a.id}`, a.at);
    for (const m of matches) add(`/live/match/${m.id}`, m.updatedAt);
  } catch {
    // Without the database (e.g. at build time) the main pages are still listed, undated.
    if (entries.length === 0) for (const path of ["", "/about", "/news", "/gallery", "/membership", "/membership/renew", "/live"]) add(path);
  }

  return entries;
}
