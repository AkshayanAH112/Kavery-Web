"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye, EyeOff, FileText, Loader2, RotateCcw } from "lucide-react";
import type { ScoreAction } from "@/lib/cricket/scoring";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { cricketApi, type ApiError } from "@/components/cricket/api";
import { formatDateTime, resultText, STATUS_LABEL } from "@/components/cricket/format";
import { MatchSetup } from "@/components/cricket/match-setup";
import { Scorecard, playerName, type AdminMatchView } from "@/components/cricket/scorecard";
import { ScoringPad } from "@/components/cricket/scoring-pad";
import { TeamBadge } from "@/components/cricket/teams-panel";
import { MatchImageDialog } from "@/components/live/MatchImageDialog";
import type { ImageLabels } from "@/components/live/summary-image";

// The console is English-only, so the image is captioned in English here.
const IMAGE_TEXT = {
  open: "Share image",
  title: "Match image",
  summary: "Summary",
  board: "Board",
  download: "Download PNG",
  share: "Share",
  close: "Close",
};

function imageLabels(match: AdminMatchView, headline: string): ImageLabels {
  return {
    summaryTitle: "Match summary",
    boardTitle: "Match centre",
    friendly: "Friendly",
    oversUnit: "ov",
    versus: "VS",
    yetToBat: "Yet to bat",
    statsTitle: "Match statistics",
    stats: {
      runs: "Runs",
      runRate: "Run rate",
      fours: "Fours",
      sixes: "Sixes",
      wicketsTaken: "Wickets taken",
      dotBalls: "Dot balls",
      extrasConceded: "Extras conceded",
      bestStand: "Best partnership",
    },
    topBatters: "Top batters",
    topBowlers: "Top bowlers",
    playerOfMatch: "Player of the match",
    oversASide: `${match.oversPerInnings} overs a side`,
    headline,
    date: match.startAt ? new Date(match.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
  };
}

export function MatchConsole() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<AdminMatchView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<"abandoned" | "no_result" | null>(null);

  useEffect(() => {
    let active = true;
    cricketApi<{ match: AdminMatchView }>(`/api/cricket/matches/${id}`)
      .then((d) => {
        if (!active) return;
        setMatch(d.match);
        setError(null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  // Every scoring button goes through here. `rev` is the revision this screen
  // last saw: if another device scored in between, the server answers 409 with
  // the current scoreboard, which replaces ours instead of being added to.
  //
  // The ref, not the `busy` state, is what stops a double-tap: two taps in one
  // frame both see the same stale `busy`, and the second would go out with the
  // same rev and come back as a 409 — harmless, but it shows the scorer an
  // alarming "changed on another device" for their own thumb.
  const acting = useRef(false);
  const act = useCallback(
    async (action: ScoreAction) => {
      if (!match || acting.current) return false;
      acting.current = true;
      setBusy(true);
      setError(null);
      try {
        const d = await cricketApi<{ match: AdminMatchView }>(`/api/cricket/matches/${id}/score`, {
          method: "POST",
          body: { rev: match.rev, action },
        });
        setMatch(d.match);
        return true;
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 409 && err.data?.match) setMatch(err.data.match);
        setError(err.message);
        return false;
      } finally {
        acting.current = false;
        setBusy(false);
      }
    },
    [id, match]
  );

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      try {
        const d = await cricketApi<{ match: AdminMatchView }>(`/api/cricket/matches/${id}`, { method: "PATCH", body });
        setMatch(d.match);
        return true;
      } catch (e: any) {
        setError(e.message);
        return false;
      }
    },
    [id]
  );

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Match not found"}
        </div>
        <Link href="/console/cricket" className="text-sm text-primary underline">Back to cricket</Link>
      </div>
    );
  }

  const inn = match.innings[match.innings.length - 1];
  const battingTeam = inn ? (inn.battingTeam === match.teamA.id ? match.teamA : match.teamB) : null;
  const finished = match.status === "completed" || match.status === "abandoned";
  const everyone = [...match.squadA, ...match.squadB];
  const headline =
    resultText(match) ??
    (match.chase && match.status === "live" && battingTeam
      ? `${battingTeam.name} need ${match.chase.runsNeeded} from ${match.chase.ballsLeft} balls`
      : match.toss
        ? `${(match.toss.wonBy === match.teamA.id ? match.teamA : match.teamB).name} won the toss and chose to ${match.toss.decision}`
        : `${match.oversPerInnings} overs a side`);

  return (
    // Narrow on purpose: this screen is used one-handed on a phone at the ground,
    // and a wide layout on a laptop would spread the pad's targets apart.
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/console/cricket" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} aria-hidden /> All matches
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => patch({ isPublished: !match.isPublished })}
            title={match.isPublished ? "Shown on the public site — tap to hide" : "Hidden from the public site — tap to show"}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              match.isPublished ? "bg-success/10 text-success hover:bg-success/20" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {match.isPublished ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
            {match.isPublished ? "Public" : "Hidden"}
          </button>
          {match.isPublished && (
            <a href={`/en/live/match/${match.id}`} target="_blank" rel="noreferrer" aria-label="Open public scoreboard" title="Open public scoreboard" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ExternalLink size={16} aria-hidden />
            </a>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="card-gold-rule p-4 shadow-xs">
        <p className="truncate text-xs text-muted-foreground">
          {[match.tournament?.name ?? "Friendly", match.title, match.venue, formatDateTime(match.startAt)].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 space-y-2">
          {[match.teamA, match.teamB].map((team) => {
            const lines = match.innings.filter((i) => i.battingTeam === team.id);
            return (
              <div key={team.id} className="flex items-center gap-3">
                <TeamBadge team={team} size={32} />
                <span className={`min-w-0 flex-1 truncate ${battingTeam?.id === team.id && !finished ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                  {team.name}
                </span>
                <span className="font-heading text-2xl tabular-nums text-foreground">
                  {lines.length ? lines.map((i) => `${i.runs}/${i.wickets}`).join(" & ") : "—"}
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {lines.length ? `${lines[lines.length - 1].overs} ov` : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">{STATUS_LABEL[match.status]}</span>
          {resultText(match) ? (
            <span className="font-semibold text-foreground">{resultText(match)}</span>
          ) : match.chase && match.status === "live" ? (
            <span className="text-foreground">
              Need <strong>{match.chase.runsNeeded}</strong> from <strong>{match.chase.ballsLeft}</strong> balls
              {match.chase.requiredRate !== null && <span className="text-muted-foreground"> · RRR {match.chase.requiredRate}</span>}
            </span>
          ) : inn ? (
            <span className="text-muted-foreground">
              {match.oversPerInnings} overs a side{inn.runRate !== null ? ` · CRR ${inn.runRate}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">{match.oversPerInnings} overs a side</span>
          )}
        </div>
      </div>

      {match.status !== "upcoming" && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/console/cricket/matches/${match.id}/sheet`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold text-foreground hover:bg-muted"
          >
            <FileText size={16} aria-hidden /> Score sheet
          </Link>
          <MatchImageDialog match={match} labels={imageLabels(match, headline)} text={IMAGE_TEXT} />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {match.status === "upcoming" && (
        <MatchSetup
          match={match}
          busy={busy}
          onSaveSquads={(squadA, squadB) => patch({ squadA, squadB })}
          onAct={act}
        />
      )}

      {match.status === "live" && <ScoringPad match={match} busy={busy} onAct={act} />}

      {match.status === "innings_break" && inn && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-center shadow-xs">
          <p className="text-foreground">
            <strong>{battingTeam?.name}</strong> finished on <strong>{inn.runs}/{inn.wickets}</strong>.{" "}
            {(battingTeam?.id === match.teamA.id ? match.teamB : match.teamA).name} need{" "}
            <strong>{inn.runs + 1}</strong> to win.
          </p>
          <button
            disabled={busy}
            onClick={() => act({ type: "start_innings" })}
            className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
            Start second innings
          </button>
        </div>
      )}

      {finished && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-xs">
          <label htmlFor="playerOfMatch" className="field-label">Player of the match</label>
          <select
            id="playerOfMatch"
            className="field cursor-pointer"
            value={match.playerOfMatch ?? ""}
            onChange={(e) => patch({ playerOfMatch: e.target.value || null })}
          >
            <option value="">Not awarded</option>
            {everyone.map((pid) => (
              <option key={pid} value={pid}>
                {playerName(match, pid)} — {(match.players[pid]?.team === match.teamA.id ? match.teamA : match.teamB).shortName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Steps back whatever happened last, in any state: the final ball of a
          finished match, an innings ended by mistake, an abandonment. */}
      {match.status !== "upcoming" && match.status !== "live" && (
        <button
          disabled={busy}
          onClick={() => act({ type: "undo" })}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <RotateCcw size={15} aria-hidden /> Undo last action
        </button>
      )}

      {!finished && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          <button onClick={() => setClosing("no_result")} className="cursor-pointer text-muted-foreground underline hover:text-foreground">
            End as no result
          </button>
          <button onClick={() => setClosing("abandoned")} className="cursor-pointer text-muted-foreground underline hover:text-foreground">
            Abandon match
          </button>
        </div>
      )}

      <Scorecard match={match} />

      <ConfirmDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        onConfirm={() => {
          const outcome = closing;
          setClosing(null);
          if (outcome) act({ type: "set_result", outcome });
        }}
        title={closing === "abandoned" ? "Abandon this match?" : "End this match as no result?"}
        description="The balls already scored are kept, and in a tournament both teams share the no-result points. Undo reopens the match."
        confirmLabel={closing === "abandoned" ? "Abandon" : "No result"}
      />
    </div>
  );
}
