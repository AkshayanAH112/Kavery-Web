"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cricketApi, type AdminTeam, type AdminTournament } from "@/components/cricket/api";
import { MatchesPanel, type AdminMatchCard } from "@/components/cricket/matches-panel";
import { TeamsPanel } from "@/components/cricket/teams-panel";
import { TournamentsPanel } from "@/components/cricket/tournaments-panel";

export type CricketTab = "matches" | "tournaments" | "teams";

/**
 * The three cricket list screens. Each is its own console route (so each has a
 * sidebar entry), but they share one loader: a new team changes what the match
 * form offers, and a deleted match changes what a team is allowed to do.
 */
export function CricketWorkspace({ tab }: { tab: CricketTab }) {
  const [matches, setMatches] = useState<AdminMatchCard[]>([]);
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panels call refresh() after a write, which just re-runs the effect below.
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([
      cricketApi<{ matches: AdminMatchCard[] }>("/api/cricket/matches"),
      cricketApi<{ tournaments: AdminTournament[] }>("/api/cricket/tournaments"),
      cricketApi<{ teams: AdminTeam[] }>("/api/cricket/teams"),
    ])
      .then(([m, t, tm]) => {
        if (!active) return;
        setMatches(m.matches);
        setTournaments(t.tournaments);
        setTeams(tm.teams);
        setError(null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} aria-label="Loading" />
        </div>
      ) : tab === "matches" ? (
        <MatchesPanel matches={matches} teams={teams} tournaments={tournaments} onChanged={refresh} />
      ) : tab === "tournaments" ? (
        <TournamentsPanel tournaments={tournaments} teams={teams} onChanged={refresh} />
      ) : (
        <TeamsPanel teams={teams} onChanged={refresh} />
      )}
    </>
  );
}
