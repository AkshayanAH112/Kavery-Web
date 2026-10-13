import { and, eq, ne } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { deleteMedia, folderDoc, folderImages, getFolder, readBody, text } from "@/lib/content/server";

const F = schema.galleryFolders;
const NOT_FOUND = () => Response.json({ error: "Folder not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext<"/api/gallery/folders/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const folder = await getFolder((await params).id);
  if (!folder) return NOT_FOUND();
  return Response.json({ folder: folderDoc(folder, await folderImages(getDb(), folder.id)) });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/gallery/folders/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const folder = await getFolder((await params).id);
  if (!folder) return NOT_FOUND();

  const data = await readBody(request);
  const db = getDb();
  const update: Partial<typeof F.$inferInsert> = {};
  if (data?.name !== undefined) {
    const name = text(data.name, 80);
    if (!name) return Response.json({ error: "Folder name is required" }, { status: 400 });
    if (await db.query.galleryFolders.findFirst({ where: and(eq(F.name, name), ne(F.id, folder.id)) })) return Response.json({ error: "Name already exists" }, { status: 400 });
    update.name = name;
  }
  if (data?.org !== undefined) update.org = data.org === "keda" ? "keda" : "ksc";

  const [updated] = Object.keys(update).length ? await db.update(F).set(update).where(eq(F.id, folder.id)).returning() : [folder];
  return Response.json({ folder: folderDoc(updated, await folderImages(db, folder.id)) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/gallery/folders/[id]">) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const folder = await getFolder((await params).id);
  if (!folder) return NOT_FOUND();

  const db = getDb();
  const images = await folderImages(db, folder.id);
  await db.delete(F).where(eq(F.id, folder.id)); // the image rows go with it (ON DELETE CASCADE)
  // …and so do the files, so a deleted album does not leave its photos in the bucket.
  await deleteMedia(images.map((img) => img.key));
  return Response.json({ success: true });
}
