import { count, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { galleryFolders: F, galleryImages: G } = schema;

/** Albums for the public gallery. An album with no photos yet is not shown. */
export async function GET() {
  const db = getDb();
  const [folders, counts] = await Promise.all([db.select().from(F).orderBy(desc(F.createdAt)), db.select({ folderId: G.folderId, n: count() }).from(G).groupBy(G.folderId)]);
  const countBy = new Map(counts.map((c) => [c.folderId, c.n]));
  return Response.json({
    folders: folders
      .filter((f) => (countBy.get(f.id) ?? 0) > 0)
      .map((f) => ({ _id: f.id, org: f.org, name: f.name, coverImageUrl: f.coverUrl ?? undefined, imageCount: countBy.get(f.id) ?? 0, createdAt: f.createdAt.toISOString() })),
  });
}
