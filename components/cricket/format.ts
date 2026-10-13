import type { MatchStatus, WicketKind } from "@/lib/cricket/engine";
import type { MatchCard, TeamBrief } from "@/lib/cricket/view";

// English-only wording for the admin console. The public site says the same
// things through next-intl (messages/*.json, the "Live" namespace) — the admin
// is deliberately not localized, so the two are kept separate.

export const STATUS_LABEL: Record<MatchStatus, string> = {
  upcoming: "Upcoming",
  live: "Live",
  innings_break: "Innings break",
  completed: "Completed",
  abandoned: "Abandoned",
};

export const WICKET_LABEL: Record<WicketKind, string> = {
  bowled: "Bowled",
  caught: "Caught",
  lbw: "LBW",
  stumped: "Stumped",
  run_out: "Run out",
  hit_wicket: "Hit wicket",
};

type ResultLike = Pick<MatchCard, "result" | "teamA" | "teamB">;

export function resultText({ result, teamA, teamB }: ResultLike): string | null {
  if (!result) return null;
  if (result.outcome === "abandoned") return "Match abandoned";
  if (result.outcome === "no_result") return "No result";
  if (result.outcome === "tie") return "Match tied";
  const winner: TeamBrief | undefined = [teamA, teamB].find((t) => t.id === result.winner);
  const unit = result.by === "wickets" ? "wicket" : "run";
  return `${winner?.name ?? "—"} won by ${result.margin} ${unit}${result.margin === 1 ? "" : "s"}`;
}

export const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Date not set";
