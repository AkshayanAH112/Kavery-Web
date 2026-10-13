import { authorize } from "@/lib/auth/guard";
import { getEnv } from "@/lib/db";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, MEDIA_FOLDERS, mediaUrl } from "@/lib/media";

/**
 * Stores one image in R2 and returns { url, publicId }. `publicId` is the R2
 * key — keep it next to the URL, because it is what lets a later delete remove
 * the file as well as the database row.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const folderName = String(form?.get("folder") ?? "");
  const folder = MEDIA_FOLDERS[folderName];
  if (!folder) return Response.json({ error: "Unknown upload folder." }, { status: 400 });

  const auth = await authorize(folder.permission);
  if (!auth.ok) return auth.response;

  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return Response.json({ error: "Upload a JPEG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "That image is larger than 4 MB. Choose a smaller one." }, { status: 400 });

  const key = `${folderName}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;
  await getEnv().MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return Response.json({ url: mediaUrl(key), publicId: key }, { status: 201 });
}
