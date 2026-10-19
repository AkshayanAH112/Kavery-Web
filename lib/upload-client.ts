/**
 * Browser-side image preparation and upload.
 *
 * Phone photos arrive at 4000px and several megabytes. The Worker cannot resize
 * them (no image library runs there), and what is stored is exactly what every
 * visitor downloads — so the photo is shrunk here, before it leaves the device:
 * longest side 1600px, re-encoded as WebP (or JPEG where WebP encoding is not
 * available). The canvas draw also applies the photo's EXIF rotation and drops
 * its metadata, including any GPS position.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // the server will refuse it with a clear message
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    // Already small and light: keep the original rather than re-encode it for nothing.
    if (scale === 1 && file.size < 400_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
      if (blob && blob.type === type) return new File([blob], file.name.replace(/\.\w+$/, type === "image/webp" ? ".webp" : ".jpg"), { type });
    }
  } catch {
    // An image the browser cannot decode goes up as it is and the server decides.
  }
  return file;
}

/**
 * Runs `upload` over many files, a few at a time. Firing a hundred phone photos at once
 * stalls a mobile connection and times requests out. One failure does not lose the
 * others: each file's outcome comes back in order.
 */
export async function uploadMany<T>(files: File[], upload: (file: File) => Promise<T>, concurrency = 4): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(files.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (cursor < files.length) {
      const current = cursor++;
      try {
        results[current] = { status: "fulfilled", value: await upload(files[current]) };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/** Shrinks, then uploads to R2. Throws with the server's own message on failure. */
export async function uploadImage(file: File, folder: "news" | "gallery" | "cricket" | "site"): Promise<{ url: string; publicId: string }> {
  const body = new FormData();
  body.append("file", await shrinkImage(file));
  body.append("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { url?: string; publicId?: string; error?: string };
  if (!res.ok || !data.url || !data.publicId) throw new Error(data.error || "Upload failed");
  return { url: data.url, publicId: data.publicId };
}
