import type { Metadata } from "next";
import { AnalysisScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Analysis" };

export default async function Page() {
  await requireSession("education.manage");
  return <AnalysisScreen />;
}
