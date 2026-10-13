import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { oneYearFrom } from "@/lib/membership/rules";
import { deletePrivateFiles, getMember, memberDocWithReviewer } from "@/lib/membership/server";

const M = schema.members;
const NOT_FOUND = () => Response.json({ error: "Member not found" }, { status: 404 });
const NONE_WAITING = () => Response.json({ error: "This member has no renewal waiting." }, { status: 400 });

/**
 * Approve the waiting renewal: its occupation, fee and slip become the member's
 * own and the membership runs for another year. The year is added to whatever
 * is left — renewing a month early does not cost the member that month — or
 * starts today if the membership had already lapsed.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/members/[id]/renewal">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const member = await getMember((await params).id);
  if (!member) return NOT_FOUND();
  if (member.renewalStatus !== "pending" || member.status !== "approved") return NONE_WAITING();

  const now = new Date();
  const stillValid = !!member.validUntil && member.validUntil.getTime() > now.getTime();
  const renewal = member.renewal ?? {};
  const [updated] = await getDb()
    .update(M)
    .set({
      job: renewal.job ?? member.job,
      jobCategory: renewal.jobCategory ?? member.jobCategory,
      annualFee: renewal.annualFee ?? null,
      paymentSlipKey: renewal.slipKey ?? null,
      validFrom: stillValid ? member.validFrom : now,
      validUntil: oneYearFrom(stillValid ? member.validUntil! : now),
      reviewedBy: auth.session.userId,
      reviewedAt: now,
      renewalStatus: "none",
      renewal: null,
    })
    .where(and(eq(M.id, member.id), eq(M.renewalStatus, "pending")))
    .returning();
  if (!updated) return NONE_WAITING();
  // The slip for the year that has now been replaced.
  if (member.paymentSlipKey !== updated.paymentSlipKey) await deletePrivateFiles([member.paymentSlipKey]);
  return Response.json({ member: await memberDocWithReviewer(updated) });
}

/** Turn the waiting renewal down. The membership stays exactly as it was. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/members/[id]/renewal">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const member = await getMember((await params).id);
  if (!member) return NOT_FOUND();
  if (member.renewalStatus !== "pending") return NONE_WAITING();

  const [updated] = await getDb().update(M).set({ renewalStatus: "none", renewal: null }).where(and(eq(M.id, member.id), eq(M.renewalStatus, "pending"))).returning();
  if (!updated) return NONE_WAITING();
  await deletePrivateFiles([member.renewal?.slipKey]);
  return Response.json({ member: await memberDocWithReviewer(updated) });
}
