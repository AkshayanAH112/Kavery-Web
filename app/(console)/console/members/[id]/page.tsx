import type { Metadata } from "next";
import { MemberDetailScreen } from "@/components/members/screens";
import { requireSession } from "@/lib/auth/guard";
import { getMembershipSettings } from "@/lib/membership/server";
import { getSettings } from "@/lib/site";

export const metadata: Metadata = { title: "Member" };

export default async function Page() {
  await requireSession("members.manage");
  const [site, membership] = await Promise.all([getSettings(), getMembershipSettings()]);
  // The club's contact lines are printed on the back of the membership card.
  return <MemberDetailScreen contact={{ address: site.address, email: site.contactEmail, phone: site.contactPhone }} currency={membership.currency} />;
}
