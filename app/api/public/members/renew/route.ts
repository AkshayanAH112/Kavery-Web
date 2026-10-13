import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getMembershipSettings, occupationFields, storePrivateFile, uploaded } from "@/lib/membership/server";
import { isValidPhone, normalizeNic, normalizePhone, PHONE_ERROR } from "@/lib/membership/rules";
import { clientIp, rateLimiter } from "@/lib/rate-limit";

const M = schema.members;

/**
 * A member asks for another year. The request waits in its own fields until an
 * administrator approves it, so the live membership — and the slip that paid
 * for it — is untouched by anything sent here.
 *
 * A member is found by phone number, and by NIC too when they have one on file.
 * "No match" is the same answer whatever was wrong, so this cannot be used to
 * learn whose number belongs to a member.
 */
const tooManyAttempts = rateLimiter(15, 10 * 60 * 1000);
const NOT_FOUND = "No approved membership matches those details. Check the phone number and NIC, or contact the club.";

// `code` lets the form show the common refusals in the visitor's own language.
const refuse = (error: string, status = 400, code?: string) => Response.json({ error, code }, { status });

export async function POST(request: Request) {
  if (tooManyAttempts(clientIp(request) ?? "unknown")) return refuse("Too many attempts from this connection. Please wait a few minutes and try again.", 429, "rate");

  const form = await request.formData().catch(() => null);
  if (!form) return refuse("Send the renewal as a form.");
  if (form.get("ksc_check")) return Response.json({ success: true }, { status: 201 });

  const settings = await getMembershipSettings();
  if (!settings.open) return refuse("The club is not taking renewals online at the moment.", 403, "closed");

  const phoneRaw = String(form.get("phone") ?? "").trim().slice(0, 30);
  if (!phoneRaw) return refuse("Enter the phone number on your membership.");
  if (!isValidPhone(phoneRaw)) return refuse(PHONE_ERROR);
  const nic = normalizeNic(String(form.get("nic") ?? "").slice(0, 30));

  const occupation = occupationFields(form, settings);
  if (!occupation.ok) return refuse(occupation.error);
  const slip = uploaded(form, "paymentSlip");
  if (settings.feeEnabled && !slip) return refuse("Add the bank slip or transfer receipt for the membership fee.");

  const db = getDb();
  const candidates = await db.select().from(M).where(and(eq(M.phone, normalizePhone(phoneRaw)), eq(M.status, "approved")));
  // A member with a NIC on file must give it; children without one are matched on the phone alone.
  const matches = candidates.filter((m) => (m.nic ? m.nic === nic : true));
  // Brothers and sisters can share a parent's number. Guessing between them would renew the wrong child.
  if (matches.length > 1) return refuse("More than one membership uses that phone number. Please contact the club to renew.", 409, "shared_phone");
  if (matches.length === 0) return refuse(NOT_FOUND, 404, "no_match");
  const member = matches[0];
  if (member.renewalStatus === "pending") return refuse("A renewal for this membership is already waiting for the club to review.", 409, "renew_waiting");

  const stored = settings.feeEnabled && slip ? await storePrivateFile(slip, "slip", "The payment slip") : null;
  if (stored && !stored.ok) return refuse(stored.error);

  await db
    .update(M)
    .set({
      renewalStatus: "pending",
      renewal: { job: occupation.job, jobCategory: occupation.jobCategory, annualFee: occupation.annualFee ?? undefined, slipKey: stored?.ok ? stored.key : undefined, submittedAt: Date.now() },
      updatedAt: new Date(),
    })
    .where(eq(M.id, member.id));
  return Response.json({ success: true }, { status: 201 });
}
