import type { Metadata } from "next";
import { BatchDetailScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Batch" };

export default async function Page() {
  await requireSession("education.manage");
  return <BatchDetailScreen />;
}
