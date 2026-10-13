import type { Metadata } from "next";
import { MembershipSettingsScreen } from "@/components/members/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Membership fees and settings" };

export default async function Page() {
  await requireSession("members.manage");
  return <MembershipSettingsScreen />;
}
