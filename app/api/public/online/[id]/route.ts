import { childPaper, studentJson } from "@/lib/keda/online-access";
import { studentPaperView } from "@/lib/keda/online";

/** The exam page for one child (`?student=<index number>`): see studentPaperView for what it holds when. */
export async function GET(request: Request, { params }: RouteContext<"/api/public/online/[id]">) {
  const access = await childPaper((await params).id, new URL(request.url).searchParams.get("student"));
  if (access.denied) return access.denied;
  return studentJson(await studentPaperView(access.paper, access.student));
}
