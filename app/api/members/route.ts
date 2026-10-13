import { desc, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { isJobCategory, MEMBER_STATUSES, oneYearFrom, type MemberStatus } from "@/lib/membership/rules";
import { deletePrivateFiles, findDuplicateMemberError, getMembershipSettings, memberDetails, memberDoc, nextMemberCode, occupationFields, storePrivateFile, uploaded } from "@/lib/membership/server";

const M = schema.members;

/** Everyone, newest first. `?status=` narrows to one status; `?renewal=pending` to members waiting on a renewal. */
export async function GET(request: Request) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const where = params.get("renewal") === "pending" ? eq(M.renewalStatus, "pending") : MEMBER_STATUSES.includes(status as MemberStatus) ? eq(M.status, status as MemberStatus) : undefined;
  const rows = await getDb().select().from(M).where(where).orderBy(desc(M.createdAt));
  return Response.json({ members: rows.map((m) => memberDoc(m)) });
}

/**
 * An administrator adds a member directly — someone who joined on paper. They
 * are approved at once (member id and a year's validity) unless `status` says
 * otherwise. Sent as a form so the photo can travel with it.
 */
export async function POST(request: Request) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Send the member as a form." }, { status: 400 });

  const parsed = memberDetails(form, false);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const settings = await getMembershipSettings();
  // Occupation is optional here; when given it is checked and priced the same way as on the public form.
  const occupation = isJobCategory(form.get("jobCategory")) ? occupationFields(form, settings) : null;
  if (occupation && !occupation.ok) return Response.json({ error: occupation.error }, { status: 400 });

  const duplicate = await findDuplicateMemberError({ age: parsed.age, ...parsed.details });
  if (duplicate) return Response.json({ error: duplicate }, { status: 409 });

  const photo = uploaded(form, "photo");
  const storedPhoto = photo ? await storePrivateFile(photo, "photo", "The photo") : null;
  if (storedPhoto && !storedPhoto.ok) return Response.json({ error: storedPhoto.error }, { status: 400 });
  const photoKey = storedPhoto?.ok ? storedPhoto.key : null;

  const status: MemberStatus = form.get("status") === "pending" ? "pending" : "approved";
  const now = new Date();
  try {
    const [row] = await getDb()
      .insert(M)
      .values({
        ...parsed.details,
        photoKey,
        ...(occupation?.ok ? { job: occupation.job, jobCategory: occupation.jobCategory, annualFee: occupation.annualFee } : {}),
        status,
        ...(status === "approved" ? { memberCode: await nextMemberCode(), validFrom: now, validUntil: oneYearFrom(now), reviewedBy: auth.session.userId, reviewedAt: now } : {}),
      })
      .returning();
    return Response.json({ member: memberDoc(row) }, { status: 201 });
  } catch (error) {
    await deletePrivateFiles([photoKey]);
    throw error;
  }
}
