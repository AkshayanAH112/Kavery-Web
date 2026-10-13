import { cardCode, findByCard, findByNumberAndPhone, forgetChildren, indexNumber, rememberChild } from "@/lib/keda/parent";
import { clientIp, rateLimiter } from "@/lib/rate-limit";

/**
 * A parent signs in for one child: `{ code }` from the student card, or
 * `{ registrationNumber, phone }`. On success the child is added to this
 * browser's cookie; the response says nothing about the child.
 *
 * Every failure is the same "no match", whether the index number, the phone or
 * the card was wrong. Two brakes (best-effort, see lib/rate-limit.ts): one per
 * connection, and one per index number so a known number cannot be tried
 * against phone after phone.
 */
const tooManyAttempts = rateLimiter(20, 10 * 60 * 1000);
const failuresForNumber = rateLimiter(5, 15 * 60 * 1000);

const refuse = (error: string, status: number, code: string) => Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
const NO_MATCH = () => refuse("Those details do not match a student. Check them and try again, or ask KEDA.", 404, "no_match");
const WAIT = () => refuse("Too many attempts. Please wait a few minutes and try again.", 429, "rate");

export async function POST(request: Request) {
  if (tooManyAttempts(clientIp(request) ?? "unknown")) return WAIT();
  const body = (await request.json().catch(() => null)) as { code?: unknown; registrationNumber?: unknown; phone?: unknown } | null;

  let student = null;
  if (body?.code !== undefined) {
    const code = cardCode(body.code);
    if (!code) return refuse("That is not a KEDA student card.", 400, "not_a_card");
    student = await findByCard(code);
  } else {
    const registrationNumber = indexNumber(body?.registrationNumber);
    if (!registrationNumber) return refuse("Enter the index number as it appears on the student card, for example KEDA/27/1000.", 400, "bad_number");
    if (typeof body?.phone !== "string" || !body.phone.trim()) return refuse("Enter the phone number the student was registered with.", 400, "bad_phone");
    if (failuresForNumber.isFull(registrationNumber)) return WAIT();
    student = await findByNumberAndPhone(registrationNumber, body.phone.slice(0, 30));
    if (!student) failuresForNumber(registrationNumber);
  }
  if (!student) return NO_MATCH();

  await rememberChild(student.id);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** Sign out: this browser forgets every child. */
export async function DELETE() {
  await forgetChildren();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
