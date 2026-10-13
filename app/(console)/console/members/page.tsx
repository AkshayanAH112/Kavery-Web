import type { Metadata } from "next";
import { MembersScreen } from "@/components/members/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Members" };

export default async function Page() {
  await requireSession("members.manage");
  return <MembersScreen />;
}
