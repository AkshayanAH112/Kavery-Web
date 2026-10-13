"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { BallLabel, MatchStatus } from "@/lib/cricket/engine";
import type { MatchCard, TeamBrief } from "@/lib/cricket/view";
import { cn } from "@/lib/utils";

type PollState = "loading" | "ok" | "not_found" | "error";

/**
 * Fetches `url` and keeps re-fetching it. `intervalFor` is asked after every
 * response how long to wait for the next one, and returning null stops the
 * polling — which is how a finished match stops costing requests while a live
 * one keeps ticking.
 *
 * Polling, not a socket: the API runs as serverless functions on Vercel, which
 * cannot hold a connection open. The responses are edge-cached for a few
 * seconds (LIVE_CACHE in lib/cricket/server.ts), so many viewers share one
 * function call. `cache: "no-store"` here only bypasses the *browser* cache —
 * without it Chrome honours stale-while-revalidate itself and shows each poll
 * one response late.
 */
export function usePolling<T>(url: string, intervalFor: (data: T | null) => number | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<PollState>("loading");
  const [offline, setOffline] = useState(false);
  const intervalRef = useRef(intervalFor);

  useEffect(() => {
    intervalRef.current = intervalFor;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: T | null = null;
    let fetched = false;

    const schedule = () => {
      const ms = intervalRef.current(latest);
      if (ms !== null && !cancelled) timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      // A hidden tab keeps its place in the schedule but skips the request;
      // coming back to the tab fetches at once (below). The first request is
      // never skipped, so a match opened in a background tab is already there
      // when the visitor switches to it.
      if (document.hidden && fetched) return schedule();
      fetched = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) return setState("not_found");
        if (!res.ok) throw new Error(String(res.status));
        latest = (await res.json()) as T;
        if (cancelled) return;
        setData(latest);
        setState("ok");
        setOffline(false);
      } catch {
        if (cancelled) return;
        setOffline(true);
        setState((s) => (s === "loading" ? "error" : s));
      }
      schedule();
    };

    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  return { data, state, offline };
}

/** The three non-content states every live page shares. Returns null once there is data to show. */
export function PollStatus({ state, offline, notFoundKey }: { state: PollState; offline: boolean; notFoundKey: string }) {
  const t = useTranslations("Live");
  const locale = useLocale();

  if (state === "not_found") {
    return (
      <div className="live-card rounded-2xl p-10 text-center">
        <h2 className="font-display text-2xl font-bold text-fg">{t(notFoundKey)}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t("not_found_body")}</p>
        <Link href={`/${locale}/live`} className="mt-5 inline-block text-sm font-bold text-accent underline underline-offset-4">
          {t("back_to_live")}
        </Link>
      </div>
    );
  }
  if (state === "loading" || state === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground" role="status">
        {state === "loading" ? <Loader2 className="animate-spin text-accent" size={32} /> : <WifiOff size={32} />}
        <p className="text-sm">{t(state === "loading" ? "loading" : "load_error")}</p>
      </div>
    );
  }
  if (offline) {
    return (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-full border border-brand/40 bg-brand/15 px-4 py-2 text-xs text-fg">
        <WifiOff size={14} className="shrink-0" /> {t("offline")}
      </p>
    );
  }
  return null;
}

/** A club crest where one was uploaded; otherwise a disc in the team colour with its short name. */
export function TeamLogo({ team, size = 40, className }: { team: TeamBrief; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (team.logoUrl) {
    return (
      // Plain <img>: the optimizer is off site-wide (next.config.ts), and crests
      // are already resized at upload.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={team.logoUrl} alt={team.name} width={size} height={size} style={style} className={cn("shrink-0 rounded-full border border-line bg-fg object-contain", className)} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: team.color || "#7f1d1d", fontSize: Math.max(9, size * 0.28) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full border border-line font-bold text-white", className)}
    >
      {team.shortName}
    </span>
  );
}

export function StatusPill({ status }: { status: MatchStatus }) {
  const t = useTranslations("Live");
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
        live
          ? "bg-brand text-on-brand"
          : status === "innings_break"
            ? "bg-brand text-on-brand"
            : "bg-surface-2 text-muted-foreground"
      )}
    >
      {live && <span className="size-1.5 animate-pulse rounded-full bg-fg motion-reduce:animate-none" />}
      {t(`status_${status}`)}
    </span>
  );
}

const BALL_STYLE: Record<BallLabel["kind"], string> = {
  dot: "bg-surface-2 text-muted-foreground",
  run: "bg-surface-2 text-fg",
  four: "bg-surface-2 text-fg",
  six: "bg-accent text-on-accent",
  wicket: "bg-brand text-on-brand",
  extra: "border border-line text-accent",
};

export function BallChip({ ball }: { ball: BallLabel }) {
  return (
    <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums", BALL_STYLE[ball.kind])}>
      {ball.text}
    </span>
  );
}

type ResultLike = Pick<MatchCard, "result" | "teamA" | "teamB">;

/** "KCSC won by 5 wickets" and friends, in the page's locale. */
export function useResultText() {
  const t = useTranslations("Live");
  return ({ result, teamA, teamB }: ResultLike): string | null => {
    if (!result) return null;
    if (result.outcome === "abandoned") return t("abandoned");
    if (result.outcome === "no_result") return t("no_result");
    if (result.outcome === "tie") return t("tied");
    const team = [teamA, teamB].find((x) => x.id === result.winner)?.name ?? "—";
    return t(result.by === "wickets" ? "won_by_wickets" : "won_by_runs", { team, margin: result.margin ?? 0 });
  };
}

// Day-first and identical in both locales, like the Results page: Tamil month
// names would change the width of every card.
export const formatMatchDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

export const formatDay = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** One match as a tappable card — used on the home, tournament and team pages. */
export function MatchCardLink({ match, showTournament = true }: { match: MatchCard; showTournament?: boolean }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  const resultText = useResultText();
  const result = resultText(match);
  const meta = [showTournament ? match.tournament?.name ?? t("friendly") : null, match.title].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/${locale}/live/match/${match.id}`}
      className="live-card block min-w-0 rounded-2xl p-4 shadow-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{meta || t("friendly")}</p>
        <StatusPill status={match.status} />
      </div>

      <div className="mt-4 space-y-2.5">
        {[match.teamA, match.teamB].map((team) => {
          const lines = match.scores.filter((s) => s.team === team.id);
          const won = match.result?.winner === team.id;
          return (
            <div key={team.id} className="flex items-center gap-3">
              <TeamLogo team={team} size={32} />
              <span className={cn("min-w-0 flex-1 truncate font-bold", won ? "text-accent" : "text-fg")}>{team.name}</span>
              {lines.length > 0 && (
                <span className="shrink-0 text-right tabular-nums">
                  <span className="font-bold text-fg">{lines.map((s) => `${s.runs}/${s.wickets}`).join(" & ")}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">({lines[lines.length - 1].overs})</span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted-foreground">
        {result ? (
          <span className="font-bold text-accent">{result}</span>
        ) : (
          [formatMatchDate(match.startAt) ?? t("date_tbc"), match.venue].filter(Boolean).join(" · ")
        )}
      </p>
    </Link>
  );
}

export function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mb-4 flex items-baseline gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
      {children}
      {count !== undefined && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </h2>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Pill tabs. Scrolls sideways rather than wrapping — Tamil labels run long. */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string }[]; value: K; onChange: (key: K) => void }) {
  return (
    <div role="tablist" className="hide-scrollbar -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            value === tab.key
              ? "border-line bg-surface-2 text-fg"
              : "border-line bg-surface-2/60 text-muted-foreground hover:text-fg"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
