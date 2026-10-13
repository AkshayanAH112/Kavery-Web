import type { Metadata } from "next";
import { StudentDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Student" };

export default async function Page() {
  await requireSession("education.manage");
  return <StudentDetailScreen />;
}
