import { childPaper, studentError, studentJson } from "@/lib/keda/online-access";
import { studentPaperView, submitAttempt } from "@/lib/keda/online";
import { readBody } from "@/lib/keda/server";

/** Hands the paper in (`{ student }`). Handing in twice, or after time is up, changes nothing. */
export async function POST(request: Request, { params }: RouteContext<"/api/public/online/[id]/submit">) {
  const access = await childPaper((await params).id, (await readBody(request))?.student);
  if (access.denied) return access.denied;
  if (!(await submitAttempt(access.paper, access.student))) return studentError("Start the paper first.", "not_started", 409);
  return studentJson(await studentPaperView(access.paper, access.student));
}
