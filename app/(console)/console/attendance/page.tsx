import type { Metadata } from "next";
import { AttendanceReportScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Attendance report" };

export default async function Page() {
  await requireSession("education.manage");
  return <AttendanceReportScreen />;
}
