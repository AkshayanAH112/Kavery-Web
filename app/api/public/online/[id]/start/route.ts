import { childPaper, studentError, studentJson } from "@/lib/keda/online-access";
import { startAttempt, studentPaperView } from "@/lib/keda/online";
import { paperStatus } from "@/lib/keda/online-rules";
import { readBody } from "@/lib/keda/server";

/** Starts the child's sitting (`{ student }`): the clock runs from now. Starting again returns the same sitting. */
export async function POST(request: Request, { params }: RouteContext<"/api/public/online/[id]/start">) {
  const access = await childPaper((await params).id, (await readBody(request))?.student);
  if (access.denied) return access.denied;
  const { paper, student } = access;
  const status = paperStatus(paper);
  if (status === "scheduled") return studentError("This exam has not opened yet.", "not_open", 409);
  if (status !== "open") return studentError("This exam has closed.", "closed", 409);
  await startAttempt(paper, student);
  return studentJson(await studentPaperView(paper, student));
}
