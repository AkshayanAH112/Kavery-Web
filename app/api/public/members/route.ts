import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { deletePrivateFiles, findDuplicateMemberError, getMembershipSettings, memberDetails, occupationFields, storePrivateFile, uploaded } from "@/lib/membership/server";
import { clientIp, rateLimiter } from "@/lib/rate-limit";

const M = schema.members;

/**
 * The public "join the club" form. Anyone can call this, so:
 *  - every field is read by name, length-capped and checked — nothing is spread
 *    from the request, and status, fee, member id and validity cannot be sent;
 *  - the fee is the one an administrator set for the occupation chosen;
 *  - the photo and payment slip go to private storage (lib/membership/server.ts);
 *  - there is a per-connection brake and a ceiling on the review queue, so the
 *    form cannot be used to fill the bucket.
 */
const tooManyAttempts = rateLimiter(30, 10 * 60 * 1000);
// Counted only when an application is actually stored, so a typo or a refused photo costs the applicant nothing.
const applicationsStored = rateLimiter(5, 60 * 60 * 1000);
const MAX_WAITING = 300;

// `code` lets the form show the common refusals in the visitor's own language.
const refuse = (error: string, status = 400, code?: string) => Response.json({ error, code }, { status });

export async function POST(request: Request) {
  const ip = clientIp(request) ?? "unknown";
  if (tooManyAttempts(ip)) return refuse("Too many attempts from this connection. Please wait a few minutes and try again.", 429, "rate");

  const form = await request.formData().catch(() => null);
  if (!form) return refuse("Send the application as a form.");
  // A field no person can see. Whatever fills it in is not an applicant, and is told what it wants to hear.
  if (form.get("ksc_check")) return Response.json({ success: true }, { status: 201 });

  const settings = await getMembershipSettings();
  if (!settings.open) return refuse("The club is not taking applications online at the moment.", 403, "closed");

  const parsed = memberDetails(form, true);
  if (!parsed.ok) return refuse(parsed.error);
  const occupation = occupationFields(form, settings);
  if (!occupation.ok) return refuse(occupation.error);
  if (form.get("consent") !== "yes") return refuse("Tick the box to agree that the club may keep these details.");

  const photo = uploaded(form, "photo");
  if (!photo) return refuse("Add a photo of the applicant.");
  const slip = uploaded(form, "paymentSlip");
  if (settings.feeEnabled && !slip) return refuse("Add the bank slip or transfer receipt for the membership fee.");

  const duplicate = await findDuplicateMemberError({ age: parsed.age, ...parsed.details });
  if (duplicate) return refuse(duplicate, 409, "duplicate");

  const db = getDb();
  if ((await db.$count(M, eq(M.status, "pending"))) >= MAX_WAITING) return refuse("The club has a lot of applications waiting. Please contact the club directly.", 503, "busy");
  if (applicationsStored.isFull(ip)) return refuse("Several applications have already been sent from this connection. Please try again later.", 429, "rate");

  const storedPhoto = await storePrivateFile(photo, "photo", "The photo");
  if (!storedPhoto.ok) return refuse(storedPhoto.error);
  // While the club charges nothing, a slip that is sent anyway is simply not kept.
  const storedSlip = settings.feeEnabled && slip ? await storePrivateFile(slip, "slip", "The payment slip") : null;
  if (storedSlip && !storedSlip.ok) {
    await deletePrivateFiles([storedPhoto.key]);
    return refuse(storedSlip.error);
  }
  const slipKey = storedSlip?.ok ? storedSlip.key : null;

  try {
    await db.insert(M).values({
      ...parsed.details,
      photoKey: storedPhoto.key,
      job: occupation.job,
      jobCategory: occupation.jobCategory,
      annualFee: occupation.annualFee,
      paymentSlipKey: slipKey,
      status: "pending",
    });
  } catch (error) {
    await deletePrivateFiles([storedPhoto.key, slipKey]);
    throw error;
  }
  applicationsStored(ip);
  return Response.json({ success: true }, { status: 201 });
}
