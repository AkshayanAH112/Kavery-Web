import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, getEnv, schema } from "@/lib/db";
import { deletePrivateFiles, storePrivateFile } from "@/lib/private-files";

const S = schema.students;
const isId = (id: string) => /^[\w-]{1,64}$/.test(id);
const find = async (id: string) => (isId(id) ? ((await getDb().query.students.findFirst({ where: eq(S.id, id) })) ?? null) : null);
const NOT_FOUND = () => Response.json({ error: "Student not found" }, { status: 404 });

/**
 * A student's photo, for the ID card and the student's page. It is a child's
 * picture, so it is private: only signed-in staff who work with the classes can
 * open it, the parent page never includes it, and the caller names a student,
 * never a storage key.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/students/[id]/photo">) {
  const auth = await authorize("attendance.mark");
  if (!auth.ok) return auth.response;
  const student = await find((await params).id);
  const object = student?.photoKey ? await getEnv().MEDIA.get(student.photoKey) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Private to this signed-in browser. The address changes when the photo does, so a short private cache is safe.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

/** Add or replace the photo. The file is identified by its contents, not by what the browser says it is. */
export async function POST(request: Request, { params }: RouteContext<"/api/students/[id]/photo">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const student = await find((await params).id);
  if (!student) return NOT_FOUND();

  const file = (await request.formData().catch(() => null))?.get("photo");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
  const stored = await storePrivateFile(file, "student", "The photo");
  if (!stored.ok) return Response.json({ error: stored.error }, { status: 400 });

  await getDb().update(S).set({ photoKey: stored.key, photoUrl: null }).where(eq(S.id, student.id));
  await deletePrivateFiles([student.photoKey]);
  return Response.json({ photoUrl: `/api/students/${student.id}/photo?v=${stored.key.slice(-12, -4)}` }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/students/[id]/photo">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const student = await find((await params).id);
  if (!student) return NOT_FOUND();
  await getDb().update(S).set({ photoKey: null, photoUrl: null }).where(eq(S.id, student.id));
  await deletePrivateFiles([student.photoKey]);
  return Response.json({ success: true });
}
