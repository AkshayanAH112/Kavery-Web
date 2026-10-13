import type { Metadata } from "next";
import { MemberNewScreen } from "@/components/members/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Add a member" };

export default async function Page() {
  await requireSession("members.manage");
  return <MemberNewScreen />;
}
