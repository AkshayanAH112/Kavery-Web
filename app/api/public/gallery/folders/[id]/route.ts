import { getDb } from "@/lib/db";
import { folderDoc, folderImages, getFolder } from "@/lib/content/server";

export async function GET(_request: Request, { params }: RouteContext<"/api/public/gallery/folders/[id]">) {
  const folder = await getFolder((await params).id);
  if (!folder) return Response.json({ error: "Folder not found" }, { status: 404 });
  return Response.json({ folder: folderDoc(folder, await folderImages(getDb(), folder.id)) });
}
