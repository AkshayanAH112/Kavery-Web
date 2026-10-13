import type { Metadata } from "next";
import { CricketWorkspace } from "@/components/cricket/workspace";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Teams" };

export default async function CricketTeamsPage() {
  await requireSession("cricket.score");
  return (
    <div className="space-y-6">
      <PageHeader title="Teams" description="Kavery's sides and the opposition, each with its team sheet. A player who has been named in a match squad can be renamed but not removed." />
      <CricketWorkspace tab="teams" />
    </div>
  );
}
