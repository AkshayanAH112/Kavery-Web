import { getEnv } from "@/lib/db";
import { MEDIA_FOLDERS } from "@/lib/media";

/**
 * Serves uploaded files straight from R2, so the bucket itself never has to be
 * public. Only folders marked public in lib/media.ts are readable here; anything
 * private (payment slips, when they arrive) needs its own signed-in route.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key: parts } = await params;
  const key = parts.join("/");
  if (!MEDIA_FOLDERS[parts[0]]?.public || parts.some((part) => part === ".." || part === "")) return new Response("Not found", { status: 404 });

  const object = await getEnv().MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Keys contain a random id and are never reused, so the file can be cached forever.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    },
  });
}
