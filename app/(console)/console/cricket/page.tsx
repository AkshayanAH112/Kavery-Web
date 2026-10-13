import type { Metadata } from "next";
import { CricketWorkspace } from "@/components/cricket/workspace";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Matches and scoring" };

export default async function CricketMatchesPage() {
  await requireSession("cricket.score");
  return (
    <div className="space-y-6">
      <PageHeader title="Matches and scoring" description="Create a fixture, pick the squads, then score it ball by ball. A published match shows on the public site as it is scored." />
      <CricketWorkspace tab="matches" />
    </div>
  );
}
