/**
 * Files that must never be public: members' photos and payment slips, and
 * students' photos. They are stored under folders that lib/media.ts does not
 * list, so /media refuses to serve them and /api/upload refuses to write them.
 * Each kind is only ever read back through its own signed-in route, which looks
 * the key up from the database row — a client never names a storage key.
 */
import { getEnv } from "@/lib/db";

export const PRIVATE_FOLDERS = { photo: "members", slip: "payments", student: "students" } as const;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** What the file really is, from its first bytes. The type a browser declares is only a claim. */
function sniff(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

type Stored = { ok: true; key: string } | { ok: false; error: string };

/** Checks and stores one private upload. A member's or student's photo must be an image; a payment slip may also be a PDF. */
export async function storePrivateFile(file: File, kind: keyof typeof PRIVATE_FOLDERS, label: string): Promise<Stored> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: `${label} is larger than 4 MB. Choose a smaller file.` };
  const body = await file.arrayBuffer();
  const type = sniff(new Uint8Array(body, 0, Math.min(body.byteLength, 16)));
  if (!type || (kind !== "slip" && type === "application/pdf")) {
    return { ok: false, error: kind !== "slip" ? `${label} must be a JPEG, PNG or WebP image.` : `${label} must be a JPEG, PNG or WebP image, or a PDF.` };
  }
  const key = `${PRIVATE_FOLDERS[kind]}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${EXTENSIONS[type]}`;
  await getEnv().MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  return { ok: true, key };
}

/** Best-effort: a storage failure must never block the database change it follows. */
export async function deletePrivateFiles(keys: (string | null | undefined)[]) {
  const real = keys.filter((k): k is string => !!k);
  if (real.length) await getEnv().MEDIA.delete(real).catch(() => {});
}
