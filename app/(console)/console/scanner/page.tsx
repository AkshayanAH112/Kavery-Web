import type { Metadata } from "next";
import { ScannerScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Scan attendance" };

export default async function Page() {
  await requireSession("attendance.mark");
  return <ScannerScreen />;
}
