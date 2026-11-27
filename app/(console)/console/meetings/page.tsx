import type { Metadata } from "next";
import { MeetingsScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Parent meetings" };

export default async function Page() {
  const session = await requireSession("attendance.mark");
  return <MeetingsScreen canManage={can(session.role, "education.manage")} />;
}
