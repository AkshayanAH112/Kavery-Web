"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ScoreAction } from "@/lib/cricket/scoring";
import type { TeamBrief } from "@/lib/cricket/view";
import { ROLE_LABEL } from "./api";
import type { AdminMatchView } from "./scorecard";
import { TeamBadge } from "./teams-panel";

/**
 * Before the first ball: pick each playing side, record the toss, start.
 * Both lock once the match starts (see PATCH /api/cricket/matches/[id]), so
 * this is the one place they are chosen.
 */
export function MatchSetup({
  match,
  busy,
  onSaveSquads,
  onAct,
}: {
  match: AdminMatchView;
  busy: boolean;
  onSaveSquads: (squadA: string[], squadB: string[]) => Promise<boolean>;
  onAct: (action: ScoreAction) => Promise<boolean>;
}) {
  const [squadA, setSquadA] = useState<string[]>(match.squadA);
  const [squadB, setSquadB] = useState<string[]>(match.squadB);
  const [wonBy, setWonBy] = useState<string>(match.toss?.wonBy ?? "");
  const [decision, setDecision] = useState<"bat" | "bowl" | "">(match.toss?.decision ?? "");

  const roster = (teamId: string) =>
    Object.entries(match.players).filter(([, p]) => p.team === teamId).map(([id, p]) => ({ id, ...p }));

  const ready = squadA.length >= 2 && squadB.length >= 2 && !!wonBy && !!decision;

  const start = async () => {
    if (!ready || !decision) return;
    // Squads first: start_innings reads them to set how many wickets end an innings.
    if (!(await onSaveSquads(squadA, squadB))) return;
    await onAct({ type: "start_innings", toss: { wonBy, decision } });
  };

  const side = (team: TeamBrief, squad: string[], setSquad: (s: string[]) => void) => {
    const players = roster(team.id);
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center gap-3">
          <TeamBadge team={team} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{team.name}</p>
            <p className="text-xs text-muted-foreground">
              {squad.length} playing{squad.length >= 2 ? ` · all out at ${squad.length - 1}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSquad(squad.length === players.length ? [] : players.map((p) => p.id))}
            className="cursor-pointer text-xs font-medium text-primary underline"
          >
            {squad.length === players.length ? "Clear" : "Select all"}
          </button>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">This team has no players yet — add them on the Teams tab.</p>
        ) : (
          <div className="space-y-1">
            {players.map((p) => (
              <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={squad.includes(p.id)}
                  onChange={(e) => setSquad(e.target.checked ? [...squad, p.id] : squad.filter((id) => id !== p.id))}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {p.name}
                  {p.isCaptain && <span className="ml-1 text-xs text-muted-foreground">(c)</span>}
                  {p.isKeeper && <span className="ml-1 text-xs text-muted-foreground">(wk)</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[p.role]}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const choice = (active: boolean) =>
    `min-h-11 flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-4">
      <h2 className="text-xl text-foreground">1. Playing sides</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {side(match.teamA, squadA, setSquadA)}
        {side(match.teamB, squadB, setSquadB)}
      </div>

      <h2 className="text-xl text-foreground">2. Toss</h2>
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-xs">
        <div>
          <p className="field-label">Won by</p>
          <div className="flex gap-2">
            {[match.teamA, match.teamB].map((t) => (
              <button key={t.id} type="button" onClick={() => setWonBy(t.id)} className={choice(wonBy === t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="field-label">Chose to</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDecision("bat")} className={choice(decision === "bat")}>Bat</button>
            <button type="button" onClick={() => setDecision("bowl")} className={choice(decision === "bowl")}>Bowl</button>
          </div>
        </div>
      </div>

      <button
        onClick={start}
        disabled={!ready || busy}
        className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
        Start match
      </button>
      {!ready && (
        <p className="text-center text-sm text-muted-foreground">
          Pick at least two players a side and record the toss to start.
        </p>
      )}
    </div>
  );
}
