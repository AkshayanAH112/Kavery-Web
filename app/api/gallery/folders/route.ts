import { desc, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { folderDoc, readBody, text } from "@/lib/content/server";

const { galleryFolders: F, galleryImages: G } = schema;

export async function GET() {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const db = getDb();
  const [folders, images] = await Promise.all([db.select().from(F).orderBy(desc(F.createdAt)), db.select().from(G)]);
  return Response.json({
    folders: folders.map((f) =>
      folderDoc(
        f,
        images.filter((img) => img.folderId === f.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    ),
  });
}

export async function POST(request: Request) {
  const auth = await authorize("content.manage");
  if (!auth.ok) return auth.response;
  const data = await readBody(request);
  const name = text(data?.name, 80);
  if (!name) return Response.json({ error: "Folder name is required" }, { status: 400 });

  const db = getDb();
  if (await db.query.galleryFolders.findFirst({ where: eq(F.name, name) })) return Response.json({ error: "A folder with this name already exists" }, { status: 400 });
  const [folder] = await db.insert(F).values({ name, org: data?.org === "keda" ? "keda" : "ksc" }).returning();
  return Response.json({ folder: folderDoc(folder, []) }, { status: 201 });
}
