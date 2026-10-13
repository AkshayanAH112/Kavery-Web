import type { Metadata } from "next";
import { MatchConsole } from "@/components/cricket/match-console";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Scoring" };

export default async function MatchScoringPage() {
  await requireSession("cricket.score");
  return <MatchConsole />;
}
