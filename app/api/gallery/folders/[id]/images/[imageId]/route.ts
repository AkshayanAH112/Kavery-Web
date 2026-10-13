import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { deleteMedia, folderImages, getFolder, imageDoc, isId, readBody, text } from "@/lib/content/server";

const { galleryFolders: F, galleryImages: G } = schema;

async function load(params: Promise<{ id: string; imageId: string }>) {
  const { id, imageId } = await params;
  const folder = await getFolder(id);
  if (!folder) return { error: Response.json({ error: "Folder not found" }, { status: 404 }) };
  const image = isId(imageId) ? await getDb().query.galleryImages.findFirst({ where: and(eq(G.id, imageId), eq(G.folderId, folder.id)) }) : null;
  if (!image) return { error: Response.json({ error: "Image not found" }, { status: 404 }) };
  return { folder, image };
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/gallery/folders/[id]/images/[imageId]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const found = await load(params);
  if (found.error) return found.error;
  const { folder, image } = found;

  const data = await readBody(request);
  const db = getDb();
  let updated = image;
  if (data?.caption !== undefined) [updated] = await db.update(G).set({ caption: text(data.caption, 200) || null }).where(eq(G.id, image.id)).returning();
  if (data?.setAsCover) await db.update(F).set({ coverUrl: image.url, coverKey: image.key }).where(eq(F.id, folder.id));
  return Response.json({ image: imageDoc(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/gallery/folders/[id]/images/[imageId]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const found = await load(params);
  if (found.error) return found.error;
  const { folder, image } = found;

  const db = getDb();
  await db.delete(G).where(eq(G.id, image.id));
  // If that was the cover, the next photo takes over (or the album goes back to having none).
  if (folder.coverUrl === image.url) {
    const next = (await folderImages(db, folder.id))[0];
    await db.update(F).set({ coverUrl: next?.url ?? null, coverKey: next?.key ?? null }).where(eq(F.id, folder.id));
  }
  await deleteMedia([image.key]);
  return Response.json({ success: true });
}
