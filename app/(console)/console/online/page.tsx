import type { Metadata } from "next";
import { OnlinePapersScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Online exams" };

export default async function Page() {
  await requireSession("education.manage");
  return <OnlinePapersScreen />;
}
