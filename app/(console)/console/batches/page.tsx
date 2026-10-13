import type { Metadata } from "next";
import { BatchesScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Batches and classes" };

export default async function Page() {
  await requireSession("education.manage");
  return <BatchesScreen />;
}
