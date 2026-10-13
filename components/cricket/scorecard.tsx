"use client";

import type { BatterLine } from "@/lib/cricket/engine";
import type { MatchView } from "@/lib/cricket/view";

export type AdminMatchView = MatchView & { rev: number; isPublished: boolean; tournamentId: string | null };

export const playerName = (match: MatchView, id?: string | null) => (id && match.players[id]?.name) || "Unknown";

/** Standard scorebook notation: "c Fielder b Bowler", "lbw b Bowler", "run out (Fielder)". */
export function dismissalText(match: MatchView, line: BatterLine, closed: boolean) {
  const out = line.out;
  if (!out) return line.atCrease ? (closed ? "not out" : "batting") : "retired hurt";
  const bowler = `b ${playerName(match, out.bowler)}`;
  switch (out.kind) {
    case "bowled":
      return bowler;
    case "caught":
      return out.fielder ? (out.fielder === out.bowler ? `c & ${bowler}` : `c ${playerName(match, out.fielder)} ${bowler}`) : `c ${bowler}`;
    case "lbw":
      return `lbw ${bowler}`;
    case "stumped":
      return out.fielder ? `st ${playerName(match, out.fielder)} ${bowler}` : `st ${bowler}`;
    case "hit_wicket":
      return `hit wicket ${bowler}`;
    case "run_out":
      return out.fielder ? `run out (${playerName(match, out.fielder)})` : "run out";
  }
}

/** Both innings as plain tables — the scorer's check that the book adds up. */
export function Scorecard({ match }: { match: MatchView }) {
  if (match.innings.length === 0) return null;
  const team = (id: string) => (id === match.teamA.id ? match.teamA : match.teamB);

  return (
    <div className="space-y-4">
      {match.innings.map((inn, i) => (
        <section key={i} className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <header className="flex items-baseline justify-between gap-3 bg-secondary px-4 py-2.5 text-secondary-foreground">
            <h3 className="truncate font-semibold">{team(inn.battingTeam).name}</h3>
            <p className="shrink-0 font-semibold tabular-nums">
              {inn.runs}/{inn.wickets} <span className="font-normal">({inn.overs} ov)</span>
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Batter</th>
                  <th className="px-2 py-2 text-right font-medium">R</th>
                  <th className="px-2 py-2 text-right font-medium">B</th>
                  <th className="px-2 py-2 text-right font-medium">4s</th>
                  <th className="px-2 py-2 text-right font-medium">6s</th>
                  <th className="px-4 py-2 text-right font-medium">SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inn.batting.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-foreground">{playerName(match, b.id)}</span>
                      <span className="block text-xs text-muted-foreground">{dismissalText(match, b, inn.isClosed)}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">{b.runs}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.balls}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.fours}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.sixes}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{b.strikeRate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
            Extras <strong className="text-foreground tabular-nums">{inn.extras.total}</strong>{" "}
            (wd {inn.extras.wd}, nb {inn.extras.nb}, b {inn.extras.b}, lb {inn.extras.lb})
          </p>

          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Bowler</th>
                  <th className="px-2 py-2 text-right font-medium">O</th>
                  <th className="px-2 py-2 text-right font-medium">M</th>
                  <th className="px-2 py-2 text-right font-medium">R</th>
                  <th className="px-2 py-2 text-right font-medium">W</th>
                  <th className="px-4 py-2 text-right font-medium">Econ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inn.bowling.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 font-medium text-foreground">{playerName(match, b.id)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.overs}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.maidens}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{b.runs}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">{b.wickets}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{b.economy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
