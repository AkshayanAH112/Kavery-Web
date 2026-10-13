import type { Metadata } from "next";
import { AlertsScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Leave alerts" };

export default async function Page() {
  await requireSession("education.manage");
  return <AlertsScreen />;
}
