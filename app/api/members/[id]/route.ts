import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { MEMBER_STATUSES, oneYearFrom, type MemberStatus } from "@/lib/membership/rules";
import { deletePrivateFiles, findDuplicateMemberError, getMember, memberDetails, memberDocWithReviewer, nextMemberCode } from "@/lib/membership/server";

const M = schema.members;
const NOT_FOUND = () => Response.json({ error: "Member not found" }, { status: 404 });

/** The personal details an administrator may correct. Money, validity and the member id are not among them. */
const EDITABLE = ["fullName", "dateOfBirth", "gender", "phone", "whatsapp", "email", "address", "nic", "guardianName", "guardianPhone", "memberType", "interest", "previousClub", "message"] as const;

export async function GET(_request: Request, { params }: RouteContext<"/api/members/[id]">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const member = await getMember((await params).id);
  if (!member) return NOT_FOUND();
  return Response.json({ member: await memberDocWithReviewer(member) });
}

/**
 * Three things, each optional: a review decision (`status`), the reviewer's
 * notes (`reviewNotes`), and corrected personal details (`details`, sent whole).
 * Anything else in the body is ignored.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[id]">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const existing = await getMember((await params).id);
  if (!existing) return NOT_FOUND();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Nothing to change." }, { status: 400 });

  const update: Partial<typeof M.$inferInsert> = {};

  if (body.details !== undefined) {
    const details = (body.details && typeof body.details === "object" ? body.details : {}) as Record<string, unknown>;
    const form = new FormData();
    for (const name of EDITABLE) form.set(name, typeof details[name] === "string" ? (details[name] as string) : "");
    const parsed = memberDetails(form, false);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const duplicate = await findDuplicateMemberError({ age: parsed.age, ...parsed.details, excludeId: existing.id });
    if (duplicate) return Response.json({ error: duplicate }, { status: 409 });
    Object.assign(update, parsed.details);
  }

  if (body.reviewNotes !== undefined) update.reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim().slice(0, 1000) || null : null;

  if (body.status !== undefined && body.status !== existing.status) {
    if (!MEMBER_STATUSES.includes(body.status as MemberStatus)) return Response.json({ error: "Unknown status." }, { status: 400 });
    const now = new Date();
    update.status = body.status as MemberStatus;
    update.reviewedBy = auth.session.userId;
    update.reviewedAt = now;
    if (update.status === "approved") {
      // Both are issued once. Approving again after a reset keeps the member's id and their dates.
      if (!existing.memberCode) update.memberCode = await nextMemberCode();
      if (!existing.validUntil) {
        update.validFrom = now;
        update.validUntil = oneYearFrom(now);
      }
    }
  }

  if (Object.keys(update).length === 0) return Response.json({ member: await memberDocWithReviewer(existing) });

  // Only if nobody else decided in the meantime: two reviewers must not both "approve" and burn two ids.
  const [updated] = await getDb().update(M).set(update).where(and(eq(M.id, existing.id), eq(M.status, existing.status))).returning();
  if (!updated) return Response.json({ error: "Someone else has just changed this application. Reload and check it again." }, { status: 409 });
  return Response.json({ member: await memberDocWithReviewer(updated) });
}

/** Removes the member and every file kept for them. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/members/[id]">) {
  const auth = await authorize("members.manage");
  if (!auth.ok) return auth.response;
  const member = await getMember((await params).id);
  if (!member) return NOT_FOUND();
  await getDb().delete(M).where(eq(M.id, member.id));
  await deletePrivateFiles([member.photoKey, member.paymentSlipKey, member.renewal?.slipKey]);
  return Response.json({ success: true });
}
