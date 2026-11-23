import { childPaper, studentError, studentJson } from "@/lib/keda/online-access";
import { saveAnswer } from "@/lib/keda/online";
import { readBody } from "@/lib/keda/server";

/**
 * Saves one answer as it is given: `{ student, questionId, choice }` or `{ ..., response }`.
 * Refused once the sitting is over; the page then shows that time is up.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/public/online/[id]/answer">) {
  const body = await readBody(request);
  const access = await childPaper((await params).id, body?.student);
  if (access.denied) return access.denied;
  const saved = await saveAnswer(access.paper, access.student, body ?? {});
  if ("error" in saved) return studentError(saved.error!, saved.code!, saved.code === "finished" ? 409 : 400);
  return studentJson({ ok: true });
}
