import type { Metadata } from "next";
import { TestDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Test" };

export default async function Page() {
  await requireSession("education.manage");
  return <TestDetailScreen />;
}
