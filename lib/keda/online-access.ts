/**
 * Who may open a paper on the exam page: a child this browser is signed in for on the parent page
 * (`student` is their index number), on a paper for their batch and grade that staff have made ready
 * — or one they have already started, should they have moved class since.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPaper, isForStudent } from "./online";
import { signedInChild } from "./parent";

const NO_STORE = { "Cache-Control": "private, no-store" };

export const studentJson = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });
export const studentError = (error: string, code: string, status: number) => studentJson({ error, code }, status);

export async function childPaper(paperId: unknown, registrationNumber: unknown) {
  const [paper, student] = await Promise.all([getPaper(paperId), signedInChild(registrationNumber)]);
  if (!student) return { denied: studentError("Sign in on the parent page first.", "signed_out", 401) } as const;
  const started = paper ? await getDb().query.onlineAttempts.findFirst({ where: and(eq(schema.onlineAttempts.paperId, paper.id), eq(schema.onlineAttempts.studentId, student.id)), columns: { id: true } }) : null;
  // Somebody else's paper looks exactly like one that does not exist.
  if (!paper || (!isForStudent(paper, student) && !started)) return { denied: studentError("That online exam was not found.", "not_found", 404) } as const;
  return { paper, student } as const;
}
