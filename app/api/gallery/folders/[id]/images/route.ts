import { and, eq, isNull } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getFolder, imageDoc, ownMedia, readBody, text } from "@/lib/content/server";

const { galleryFolders: F, galleryImages: G } = schema;

/**
 * Attaches one uploaded photo to an album. Each photo is its own row, so a
 * hundred uploads landing at once cannot overwrite each other the way pushes
 * into a single album document could.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/gallery/folders/[id]/images">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const folder = await getFolder((await params).id);
  if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });

  const data = await readBody(request);
  const media = ownMedia(data?.url, data?.publicId, "gallery");
  if (!media) return Response.json({ error: "That image is not an upload from this site" }, { status: 400 });

  const db = getDb();
  const [image] = await db.insert(G).values({ folderId: folder.id, url: media.url, key: media.key, caption: text(data?.caption, 200) || null }).returning();
  // The first photo becomes the cover. Conditional, so two first uploads racing cannot both claim it.
  await db.update(F).set({ coverUrl: media.url, coverKey: media.key }).where(and(eq(F.id, folder.id), isNull(F.coverUrl)));
  return Response.json({ image: imageDoc(image) }, { status: 201 });
}
