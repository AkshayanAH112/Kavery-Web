import type { Metadata } from "next";
import { OnlinePaperScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Online paper" };

/** Questions, settings and the ready switch for one online paper. */
export default async function Page() {
  await requireSession("education.manage");
  return <OnlinePaperScreen />;
}
