import { and, eq } from "drizzle-orm";
import { getDb, getEnv, schema } from "@/lib/db";
import { childPaper } from "@/lib/keda/online-access";
import { imageKey } from "@/lib/keda/online";

/**
 * A picture in a question (`?student=…&q=<question>&o=<answer>`), for a child who has started the
 * paper. Before they start, nobody outside the staff can see any of it.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/public/online/[id]/image">) {
  const q = new URL(request.url).searchParams;
  const access = await childPaper((await params).id, q.get("student"));
  if (access.denied) return access.denied;
  const started = await getDb().query.onlineAttempts.findFirst({
    where: and(eq(schema.onlineAttempts.paperId, access.paper.id), eq(schema.onlineAttempts.studentId, access.student.id)),
    columns: { id: true },
  });
  const key = started ? await imageKey(access.paper.id, q.get("q"), q.get("o")) : null;
  const object = key ? await getEnv().MEDIA.get(key) : null;
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
