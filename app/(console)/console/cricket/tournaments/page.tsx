import type { Metadata } from "next";
import { CricketWorkspace } from "@/components/cricket/workspace";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Tournaments" };

export default async function CricketTournamentsPage() {
  await requireSession("cricket.manage");
  return (
    <div className="space-y-6">
      <PageHeader title="Tournaments" description="A tournament and its matches stay hidden from the public site until you publish it." />
      <CricketWorkspace tab="tournaments" />
    </div>
  );
}
