import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { CricketWorkspace } from "@/components/cricket/workspace";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Matches and scoring" };

export default async function CricketMatchesPage() {
  await requireSession("cricket.score");
  return (
    <div className="space-y-6">
      <PageHeader title="Matches and scoring" description="Create a fixture, pick the squads, then score it ball by ball. A published match shows on the public site as it is scored."
        action={
          <Link href="/console/cricket/sheet" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">
            <FileText size={16} aria-hidden /> Blank score sheet
          </Link>
        }
      />
      <CricketWorkspace tab="matches" />
    </div>
  );
}
