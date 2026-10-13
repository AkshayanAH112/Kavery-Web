import type { MetadataRoute } from "next";
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const BASE = "https://periyaneelavanaikaverysports.club";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static routes available in both English and Tamil
  const staticRoutes = [
    { path: "", changeFrequency: "daily" as const, priority: 1.0 },
    { path: "/about", changeFrequency: "monthly" as const, priority: 0.8 },
    { path: "/news", changeFrequency: "daily" as const, priority: 0.9 },
    { path: "/gallery", changeFrequency: "weekly" as const, priority: 0.8 },
    { path: "/membership", changeFrequency: "monthly" as const, priority: 0.8 },
    { path: "/membership/renew", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/live", changeFrequency: "always" as const, priority: 0.9 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const r of staticRoutes) {
    for (const locale of ["en", "ta"] as const) {
      entries.push({
        url: `${BASE}/${locale}${r.path}`,
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
        alternates: {
          languages: {
            en: `${BASE}/en${r.path}`,
            ta: `${BASE}/ta${r.path}`,
            "x-default": `${BASE}/en${r.path}`,
          },
        },
      });
    }
  }

  // Dynamic routes from database
  try {
    const db = getDb();

    // Published news posts
    const posts = await db
      .select({ slug: schema.posts.slug, publishedAt: schema.posts.publishedAt, updatedAt: schema.posts.updatedAt })
      .from(schema.posts)
      .where(eq(schema.posts.status, "published"))
      .orderBy(desc(schema.posts.publishedAt))
      .limit(100);

    for (const post of posts) {
      const postDate = post.updatedAt ?? post.publishedAt ?? now;
      for (const locale of ["en", "ta"] as const) {
        entries.push({
          url: `${BASE}/${locale}/news/${post.slug}`,
          lastModified: postDate,
          changeFrequency: "weekly",
          priority: 0.8,
          alternates: {
            languages: {
              en: `${BASE}/en/news/${post.slug}`,
              ta: `${BASE}/ta/news/${post.slug}`,
              "x-default": `${BASE}/en/news/${post.slug}`,
            },
          },
        });
      }
    }

    // Published gallery albums
    const albums = await db
      .select({ id: schema.galleryFolders.id, updatedAt: schema.galleryFolders.updatedAt })
      .from(schema.galleryFolders)
      .where(isNotNull(schema.galleryFolders.coverUrl))
      .limit(60);

    for (const album of albums) {
      const albumDate = album.updatedAt ?? now;
      for (const locale of ["en", "ta"] as const) {
        entries.push({
          url: `${BASE}/${locale}/gallery/${album.id}`,
          lastModified: albumDate,
          changeFrequency: "monthly",
          priority: 0.7,
          alternates: {
            languages: {
              en: `${BASE}/en/gallery/${album.id}`,
              ta: `${BASE}/ta/gallery/${album.id}`,
              "x-default": `${BASE}/en/gallery/${album.id}`,
            },
          },
        });
      }
    }

    // Published matches
    const matches = await db
      .select({ id: schema.cricketMatches.id, startAt: schema.cricketMatches.startAt })
      .from(schema.cricketMatches)
      .where(eq(schema.cricketMatches.isPublished, true))
      .limit(60);

    for (const match of matches) {
      const matchDate = match.startAt ? new Date(match.startAt) : now;
      for (const locale of ["en", "ta"] as const) {
        entries.push({
          url: `${BASE}/${locale}/live/match/${match.id}`,
          lastModified: matchDate,
          changeFrequency: "daily",
          priority: 0.8,
          alternates: {
            languages: {
              en: `${BASE}/en/live/match/${match.id}`,
              ta: `${BASE}/ta/live/match/${match.id}`,
              "x-default": `${BASE}/en/live/match/${match.id}`,
            },
          },
        });
      }
    }
  } catch {
    // If DB is unreachable during build phase, static entries are safely served.
  }

  return entries;
}
