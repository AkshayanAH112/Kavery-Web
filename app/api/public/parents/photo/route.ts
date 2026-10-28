import { getEnv } from "@/lib/db";
import { signedInChild } from "@/lib/keda/parent";

/**
 * A child's photo (`?student=<index number>`), for the parent page. Only a browser whose
 * `ksc_parent` cookie names that child gets it; anyone else gets the same 404 as a child with no photo.
 */
export async function GET(request: Request) {
  const student = await signedInChild(new URL(request.url).searchParams.get("student"));
  const object = student?.photoKey ? await getEnv().MEDIA.get(student.photoKey) : null;
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Private to this browser. The address changes when the photo does, so a short private cache is safe.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
