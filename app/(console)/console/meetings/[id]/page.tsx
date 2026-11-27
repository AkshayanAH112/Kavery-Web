import type { Metadata } from "next";
import { MeetingDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";
import { can } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Parent meeting" };

export default async function Page({ params }: PageProps<"/console/meetings/[id]">) {
  const session = await requireSession("attendance.mark");
  return <MeetingDetailScreen id={(await params).id} canManage={can(session.role, "education.manage")} />;
}
