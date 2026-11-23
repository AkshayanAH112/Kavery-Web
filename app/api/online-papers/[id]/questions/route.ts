import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { blankQuestion, getPaper, hasAttempts, questionDoc, questionsOf } from "@/lib/keda/online";
import { MAX_QUESTIONS } from "@/lib/keda/online-rules";

/** Adds a blank question at the end, for the editor to fill in. */
export async function POST(_request: Request, { params }: RouteContext<"/api/online-papers/[id]/questions">) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;
  const paper = await getPaper((await params).id);
  if (!paper) return Response.json({ error: "Online paper not found" }, { status: 404 });
  if (await hasAttempts(paper.id)) return Response.json({ error: "Students have started this paper, so no questions can be added." }, { status: 409 });
  const questions = await questionsOf(paper.id);
  if (questions.length >= MAX_QUESTIONS) return Response.json({ error: `A paper can have up to ${MAX_QUESTIONS} questions.` }, { status: 400 });
  const position = Math.max(-1, ...questions.map((q) => q.position)) + 1;
  const [question] = await getDb().insert(schema.onlineQuestions).values(blankQuestion(paper.id, position)).returning();
  return Response.json({ question: questionDoc(question) }, { status: 201 });
}
