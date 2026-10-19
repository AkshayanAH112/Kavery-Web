import type { Metadata } from "next";
import { ExamDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Enter marks" };

/** Mark entry for one paper (Part 1 or Part 2) of a test. */
export default async function Page() {
  await requireSession("education.manage");
  return <ExamDetailScreen />;
}
