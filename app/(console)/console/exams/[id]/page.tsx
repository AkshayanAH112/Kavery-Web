import type { Metadata } from "next";
import { ExamDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Exam" };

export default async function Page() {
  await requireSession("education.manage");
  return <ExamDetailScreen />;
}
