import type { Metadata } from "next";
import { AttendanceTodayScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Today's registers" };

export default async function Page() {
  await requireSession("attendance.mark");
  return <AttendanceTodayScreen />;
}
