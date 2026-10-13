import type { Metadata } from "next";
import { ExamsScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Exams and marks" };

export default async function Page() {
  await requireSession("education.manage");
  return <ExamsScreen />;
}
