import type { Metadata } from "next";
import { OnlineResultsScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Online paper results" };

/** Who has sat an online paper, marking its short answers, and copying scores to the test. */
export default async function Page() {
  await requireSession("education.manage");
  return <OnlineResultsScreen />;
}
