import type { Metadata } from "next";
import { ClassDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Class register" };

export default async function Page() {
  await requireSession("attendance.mark");
  return <ClassDetailScreen />;
}
