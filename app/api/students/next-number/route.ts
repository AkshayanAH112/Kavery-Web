import { authorize } from "@/lib/auth/guard";
import { getBatch, peekRegistrationNumber } from "@/lib/keda/server";

/**
 * GET /api/students/next-number?batchId=… — the index number the next student
 * registered in that batch would get, for the Register Student form to show.
 * Nothing is reserved: the number is only taken when the student is saved.
 */
export async function GET(request: Request) {
  const auth = await authorize("education.manage");
  if (!auth.ok) return auth.response;

  const batch = await getBatch(new URL(request.url).searchParams.get("batchId"));
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });
  return Response.json({ registrationNumber: await peekRegistrationNumber(batch.year), year: batch.year });
}
