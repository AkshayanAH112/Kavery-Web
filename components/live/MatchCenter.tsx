"use client";

import { useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { BatterLine } from "@/lib/cricket/engine";
import { colourOnInk, LOWER_IS_BETTER, STAT_ROWS, teamStats, topBatters, topBowlers, type Performer, type StatKey } from "@/lib/cricket/match-stats";
import type { MatchView, TeamBrief } from "@/lib/cricket/view";
import { cn } from "@/lib/utils";
import { MatchImageDialog } from "./MatchImageDialog";
import type { ImageLabels } from "./summary-image";
import { BallChip, EmptyNote, PollStatus, SectionTitle, StatusPill, Tabs, TeamLogo, formatDay, formatMatchDate, usePolling, useResultText } from "./shared";

type Innings = MatchView["innings"][number];
type Tab = "live" | "scorecard" | "overs" | "squads";

// Column heads stay as the Latin scorebook abbreviations in both locales —
// R, B, 4s, 6s, SR, O, M, W are how a Tamil scorecard is written too, and
// spelling them out would not fit six columns on a phone.
const th = "px-2 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const td = "px-2 py-2.5 text-right tabular-nums text-muted-foreground";

export default function MatchCenter({ id }: { id: string }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  const resultText = useResultText();
  const [tab, setTab] = useState<Tab>("live");

  const { data, state, offline } = usePolling<{ match: MatchView }>(`/api/public/cricket/matches/${id}`, (d) => {
    const status = d?.match.status;
    if (!status) return 10_000; // first load failed — keep trying
    if (status === "live" || status === "innings_break") return 5_000;
    if (status === "upcoming") return 30_000;
    return null; // finished: the scorecard will not change again
  });

  const status = <PollStatus state={state} offline={offline} notFoundKey="not_found_match" />;
  if (!data) return status;
  const match = data.match;

  const team = (teamId: string) => (teamId === match.teamA.id ? match.teamA : match.teamB);
  const name = (pid?: string | null) => (pid && match.players[pid]?.name) || "—";
  const squadOf = (teamId: string) => (teamId === match.teamA.id ? match.squadA : match.squadB);
  const current = match.innings[match.innings.length - 1] as Innings | undefined;
  const isLive = match.status === "live";
  const result = resultText(match);

  // A function, not a component: declared inside render, a component would be
  // a new type on every poll and remount every name in the table.
  const playerLink = (pid?: string | null, className?: string) =>
    pid && match.players[pid] ? (
      <Link href={`/${locale}/live/player/${pid}`} className={cn("hover:text-accent hover:underline", className)}>
        {name(pid)}
      </Link>
    ) : (
      <span className={className}>{name(pid)}</span>
    );

  const dismissal = (line: BatterLine, closed: boolean) => {
    const out = line.out;
    if (!out) return line.atCrease ? t(closed ? "not_out" : "batting") : t("retired_hurt");
    const bowler = `b ${name(out.bowler)}`;
    switch (out.kind) {
      case "bowled":
        return bowler;
      case "caught":
        return out.fielder ? (out.fielder === out.bowler ? `c & ${bowler}` : `c ${name(out.fielder)} ${bowler}`) : `c ${bowler}`;
      case "lbw":
        return `lbw ${bowler}`;
      case "stumped":
        return out.fielder ? `st ${name(out.fielder)} ${bowler}` : `st ${bowler}`;
      case "hit_wicket":
        return `hit wicket ${bowler}`;
      case "run_out":
        return out.fielder ? `${t("run_out")} (${name(out.fielder)})` : t("run_out");
    }
  };

  // The one line under the scores that says where the match stands.
  let headline: string | null = result;
  if (!headline && current) {
    if (match.status === "innings_break") {
      headline = t("need_to_win", { team: team(current.bowlingTeam).name, target: current.runs + 1 });
    } else if (isLive && match.chase) {
      headline = t("need", { team: team(current.battingTeam).name, runs: match.chase.runsNeeded, balls: match.chase.ballsLeft });
    }
  }
  if (!headline && match.toss) headline = t("toss", { team: team(match.toss.wonBy).name, decision: match.toss.decision });
  if (!headline) headline = t("yet_to_start");

  const battingTable = (inn: Innings, lines: BatterLine[], compact = false) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={cn(th, "pl-4 text-left")}>{t("batter")}</th>
            <th className={th}>R</th>
            <th className={th}>B</th>
            <th className={th}>4s</th>
            <th className={th}>6s</th>
            <th className={cn(th, "pr-4")}>SR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((b) => (
            <tr key={b.id}>
              <td className="py-2.5 pl-4 pr-2">
                {playerLink(b.id, "font-bold text-fg")}
                {compact && match.live?.striker === b.id && <span className="ml-1 text-accent" aria-hidden>*</span>}
                {!compact && <span className="block text-xs text-muted-foreground">{dismissal(b, inn.isClosed)}</span>}
              </td>
              <td className={cn(td, "font-bold text-fg")}>{b.runs}</td>
              <td className={td}>{b.balls}</td>
              <td className={td}>{b.fours}</td>
              <td className={td}>{b.sixes}</td>
              <td className={cn(td, "pr-4")}>{b.strikeRate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const bowlingTable = (lines: Innings["bowling"]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={cn(th, "pl-4 text-left")}>{t("bowler")}</th>
            <th className={th}>O</th>
            <th className={th}>M</th>
            <th className={th}>R</th>
            <th className={th}>W</th>
            <th className={cn(th, "pr-4")}>Econ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((b) => (
            <tr key={b.id}>
              <td className="py-2.5 pl-4 pr-2">
                {playerLink(b.id, "font-bold text-fg")}
              </td>
              <td className={td}>{b.overs}</td>
              <td className={td}>{b.maidens}</td>
              <td className={td}>{b.runs}</td>
              <td className={cn(td, "font-bold text-fg")}>{b.wickets}</td>
              <td className={cn(td, "pr-4")}>{b.economy ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const stat = (label: string, value: React.ReactNode) => (
    <div className="glass px-3 py-2.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums text-fg">{value}</p>
    </div>
  );

  const statLabels: Record<StatKey, string> = {
    runs: t("runs"),
    runRate: t("crr"),
    fours: t("fours"),
    sixes: t("sixes"),
    wicketsTaken: t("stat_wickets_taken"),
    dotBalls: t("dot_balls"),
    extrasConceded: t("stat_extras_conceded"),
    bestStand: t("stat_best_stand"),
  };

  // Team against team, figure by figure. Each side's bar grows from the middle
  // in proportion to the larger figure; the better side's bar is at full strength.
  const statsPanel = () => {
    const sides = [match.teamA, match.teamB] as const;
    const [a, b] = sides.map((side) => teamStats(match, side.id));
    const colours = [colourOnInk(match.teamA.color, "var(--red-500)"), colourOnInk(match.teamB.color, "var(--yellow-400)")];
    return (
      <section className="glass p-4 md:p-5">
        <SectionTitle>{t("stats_title")}</SectionTitle>
        <div className="flex justify-between gap-3 text-sm font-bold">
          {sides.map((side, i) => (
            <span key={side.id} className="flex items-center gap-2" style={{ color: colours[i] }}>
              {i === 1 && <span className="text-fg">{side.shortName}</span>}
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: colours[i] }} />
              {i === 0 && <span className="text-fg">{side.shortName}</span>}
            </span>
          ))}
        </div>
        <ul className="mt-1 divide-y divide-line">
          {STAT_ROWS.map((key) => {
            const va = a[key] ?? 0;
            const vb = b[key] ?? 0;
            const top = Math.max(va, vb) || 1;
            const lead = LOWER_IS_BETTER.has(key) ? (va <= vb ? 0 : 1) : va >= vb ? 0 : 1;
            return (
              <li key={key} className="py-3">
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-baseline gap-2">
                  <span className="font-display text-2xl font-extrabold lining-nums tabular-nums text-fg">
                    <span className="sr-only">{match.teamA.name}: </span>
                    {a[key] ?? "—"}
                  </span>
                  <span className="text-center text-xs font-semibold text-muted-foreground">{statLabels[key]}</span>
                  <span className="text-right font-display text-2xl font-extrabold lining-nums tabular-nums text-fg">
                    <span className="sr-only">{match.teamB.name}: </span>
                    {b[key] ?? "—"}
                  </span>
                </div>
                <div aria-hidden className="mt-1.5 grid grid-cols-2 gap-1">
                  {[va, vb].map((v, i) => (
                    <div key={i} className={cn("flex h-1.5 overflow-hidden rounded-full bg-line", i === 0 && "justify-end")}>
                      <span
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${(v / top) * 100}%`, backgroundColor: colours[i], opacity: lead === i ? 1 : 0.45 }}
                      />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  // "Alex Carey": first names light, surname bold, the way a broadcast caption sets them.
  const captionName = (pid: string) => {
    const parts = name(pid).split(/\s+/);
    const last = parts.pop();
    return (
      <Link href={`/${locale}/live/player/${pid}`} className="min-w-0 truncate text-fg hover:text-accent hover:underline">
        {parts.length > 0 && <span className="font-normal">{parts.join(" ")} </span>}
        <span className="font-bold">{last}</span>
      </Link>
    );
  };

  const performerList = (title: string, items: Performer[]) => (
    <div className="min-w-0">
      <p className="px-4 pb-1 pt-3 text-xs font-semibold text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-muted-foreground">—</p>
      ) : (
        <ul>
          {items.map((perf) => (
            <li key={perf.id} className="flex items-baseline justify-between gap-3 px-4 py-2 odd:bg-fg/[0.04]">
              {captionName(perf.id)}
              <span className="shrink-0 font-display text-2xl font-extrabold lining-nums tabular-nums text-fg">{perf.figure}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // Each innings as a paper-white team bar over its best batters and the bowlers who bowled at them.
  const performersPanel = () => (
    <section className="glass overflow-hidden">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <SectionTitle>{t("top_performers")}</SectionTitle>
      </div>
      {match.innings.map((inn, i) => {
        const side = team(inn.battingTeam);
        return (
          <div key={i} className="pb-2">
            <div className="flex items-center gap-3 bg-fg py-2 pl-3 pr-4 text-bg">
              <span aria-hidden className="h-8 w-1 rounded-full" style={{ backgroundColor: side.color || "var(--red-500)" }} />
              <TeamLogo team={side} size={28} />
              <span className="display min-w-0 flex-1 truncate pt-0.5 text-xl">{side.name}</span>
              <span className="display shrink-0 pt-0.5 text-2xl lining-nums tabular-nums">
                {inn.runs}/{inn.wickets}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">
                {inn.overs} {t("overs_unit")}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-line">
              {performerList(t("batting_title"), topBatters(inn))}
              {performerList(t("bowling_title"), topBowlers(inn))}
            </div>
          </div>
        );
      })}
    </section>
  );

  const livePanel = () => {
    if (!current) return <EmptyNote>{t("yet_to_start")}</EmptyNote>;
    const live = match.live;
    const stand = [...current.partnerships].reverse().find((p) => p.wicket === null);
    const thisOver = live?.overComplete ? [] : current.oversLog[current.oversLog.length - 1]?.balls ?? [];
    const atCrease = current.batting.filter((b) => b.atCrease);
    const bowler = current.bowling.find((b) => b.id === live?.bowler);
    const recent = [...current.oversLog].reverse().slice(0, 5);
    const pom = match.playerOfMatch;

    return (
      <div className="flex flex-col gap-5">
        {pom && match.players[pom] && (
          <div className="live-card flex items-center gap-4 rounded-2xl p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
              <Award size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">{t("player_of_match")}</p>
              {playerLink(pom, "font-display text-xl font-bold text-fg")}
              <p className="text-xs text-muted-foreground">{team(match.players[pom].team).name}</p>
            </div>
          </div>
        )}

        {live && (
          <div className="live-card overflow-hidden rounded-2xl">
            {atCrease.length > 0 ? battingTable(current, atCrease, true) : <p className="px-4 py-3 text-sm text-muted-foreground">{t("new_batter")}</p>}
            <div className="border-t border-line">
              {bowler ? bowlingTable([bowler]) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {live.bowler ? playerLink(live.bowler, "font-bold text-fg") : t("new_bowler")}
                </p>
              )}
            </div>
            <div className="flex min-h-14 flex-wrap items-center gap-1.5 border-t border-line px-4 py-3">
              <span className="mr-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("this_over")}</span>
              {thisOver.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : thisOver.map((b, i) => <BallChip key={i} ball={b} />)}
              {live.freeHit && (
                <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-on-accent">
                  {t("free_hit")}
                </span>
              )}
            </div>
          </div>
        )}

        {isLive && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat(t("crr"), current.runRate ?? "—")}
            {match.chase && stat(t("target"), match.chase.target)}
            {match.chase && stat(t("rrr"), match.chase.requiredRate ?? "—")}
            {stand && stat(t("partnership"), t("partnership_value", { runs: stand.runs, balls: stand.balls }))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {statsPanel()}
          {performersPanel()}
        </div>

        {recent.length > 0 && (
          <div>
            <SectionTitle>{t("recent_overs")}</SectionTitle>
            <div className="flex flex-col gap-2">
              {recent.map((over) => (
                <div key={over.no} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-2/50 px-3 py-2">
                  <span className="w-16 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{t("over_n", { n: over.no })}</span>
                  {over.balls.map((b, i) => <BallChip key={i} ball={b} />)}
                  <span className="ml-auto text-xs font-bold tabular-nums text-fg">{over.runs}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const scorecard = () =>
    match.innings.length === 0 ? (
      <EmptyNote>{t("no_innings")}</EmptyNote>
    ) : (
      <div className="flex flex-col gap-6">
        {match.innings.map((inn, i) => {
          const batted = new Set(inn.batting.map((b) => b.id));
          const waiting = squadOf(inn.battingTeam).filter((pid) => !batted.has(pid));
          return (
            <section key={i} className="live-card overflow-hidden rounded-2xl">
              <header className="flex items-center gap-3 bg-surface-2/40 px-4 py-3">
                <TeamLogo team={team(inn.battingTeam)} size={28} />
                <h3 className="min-w-0 flex-1 truncate font-bold text-fg">{team(inn.battingTeam).name}</h3>
                <p className="shrink-0 font-bold tabular-nums text-fg">
                  {inn.runs}/{inn.wickets} <span className="text-xs font-normal text-muted-foreground">({inn.overs} {t("overs_unit")})</span>
                </p>
              </header>

              {battingTable(inn, inn.batting)}

              <div className="flex justify-between gap-3 border-t border-line px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">
                  {t("extras")}{" "}
                  <span className="text-xs">(wd {inn.extras.wd}, nb {inn.extras.nb}, b {inn.extras.b}, lb {inn.extras.lb})</span>
                </span>
                <span className="font-bold tabular-nums text-fg">{inn.extras.total}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5 text-sm font-bold text-fg">
                <span>{t("total")}</span>
                <span className="tabular-nums">
                  {inn.runs}/{inn.wickets} ({inn.overs} {t("overs_unit")})
                </span>
              </div>

              {waiting.length > 0 && (
                <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-bold text-fg">{t(inn.isClosed ? "did_not_bat" : "yet_to_bat")}:</span>{" "}
                  {waiting.map((pid) => name(pid)).join(", ")}
                </p>
              )}

              {inn.fallOfWickets.length > 0 && (
                <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-bold text-fg">{t("fall_of_wickets")}:</span>{" "}
                  {inn.fallOfWickets.map((f) => `${f.runs}-${f.wicket} (${name(f.playerOut)}, ${f.over})`).join(", ")}
                </p>
              )}

              <div className="border-t border-line">{bowlingTable(inn.bowling)}</div>
            </section>
          );
        })}
      </div>
    );

  const overs = () =>
    !match.innings.some((inn) => inn.oversLog.length > 0) ? (
      <EmptyNote>{t("no_overs")}</EmptyNote>
    ) : (
      <div className="flex flex-col gap-8">
        {[...match.innings].reverse().map((inn, i) => (
          <section key={i}>
            <SectionTitle>{team(inn.battingTeam).name}</SectionTitle>
            <div className="flex flex-col gap-2">
              {[...inn.oversLog].reverse().map((over) => (
                <div key={over.no} className="rounded-xl bg-surface-2/50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      <span className="font-bold text-fg">{t("over_n", { n: over.no })}</span> · {name(over.bowler)}
                    </span>
                    <span className="shrink-0 font-bold text-fg">{t("runs_n", { runs: over.runs })}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{over.balls.map((b, j) => <BallChip key={j} ball={b} />)}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );

  const squads = () => (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {[match.teamA, match.teamB].map((side: TeamBrief) => {
        const squad = squadOf(side.id);
        return (
          <section key={side.id} className="live-card overflow-hidden rounded-2xl">
            <header className="flex items-center gap-3 bg-surface-2/40 px-4 py-3">
              <TeamLogo team={side} size={28} />
              <Link href={`/${locale}/live/team/${side.id}`} className="min-w-0 flex-1 truncate font-bold text-fg hover:underline">
                {side.name}
              </Link>
            </header>
            {squad.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">{t("squad_empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {squad.map((pid) => {
                  const p = match.players[pid];
                  return (
                    <li key={pid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        {playerLink(pid, "font-bold text-fg")}
                        {p?.isCaptain && <span className="ml-1.5 text-xs text-accent" title={t("captain")}>(c)</span>}
                        {p?.isKeeper && <span className="ml-1.5 text-xs text-accent" title={t("keeper")}>(wk)</span>}
                      </span>
                      {p && <span className="shrink-0 text-xs text-muted-foreground">{t(`role_${p.role}`)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );

  const meta = [match.title, match.venue, formatMatchDate(match.startAt), t("overs_a_side", { overs: match.oversPerInnings })].filter(Boolean);

  const imageLabels: ImageLabels = {
    summaryTitle: t("summary_title"),
    boardTitle: t("board_title"),
    friendly: t("friendly"),
    oversUnit: t("overs_unit"),
    versus: t("vs"),
    yetToBat: t("yet_to_bat_team"),
    statsTitle: t("stats_title"),
    stats: statLabels,
    topBatters: t("top_batters"),
    topBowlers: t("top_bowlers"),
    playerOfMatch: t("player_of_match"),
    oversASide: t("overs_a_side", { overs: match.oversPerInnings }),
    headline,
    date: formatDay(match.startAt),
  };

  // One side of the board: crest, name, and the score in the team's colour bar.
  const boardSide = (side: TeamBrief) => {
    const lines = match.innings.filter((inn) => inn.battingTeam === side.id);
    const batting = isLive && current?.battingTeam === side.id;
    const won = match.result?.winner === side.id;
    return (
      <div className="flex min-w-0 flex-col items-center text-center">
        <TeamLogo team={side} size={72} />
        <Link
          href={`/${locale}/live/team/${side.id}`}
          className={cn("display mt-3 line-clamp-2 max-w-full text-xl hover:underline md:text-3xl", won || batting ? "text-accent" : "text-fg")}
        >
          {side.name}
        </Link>
        <div className="mt-3 w-full max-w-56 overflow-hidden rounded-xl bg-bg/55 px-2 pb-2.5 pt-0">
          <span aria-hidden className="mx-auto mb-2 block h-1 w-3/5 rounded-b-full" style={{ backgroundColor: colourOnInk(side.color, "var(--red-500)") }} />
          {lines.length > 0 ? (
            <>
              <p className="font-display text-4xl font-black leading-none lining-nums tabular-nums text-fg md:text-6xl">
                {lines.map((inn) => `${inn.runs}/${inn.wickets}`).join(" & ")}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {lines[lines.length - 1].overs} {t("overs_unit")}
                {batting && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle motion-safe:animate-pulse" aria-hidden />}
              </p>
            </>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t("yet_to_bat_team")}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {status}

      {/* Scoreboard: the two sides facing each other over a floodlit ground. */}
      <section className="match-stage relative mb-6 overflow-hidden rounded-2xl border border-line">
        <div className="relative p-4 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
              {match.tournament ? (
                <Link href={`/${locale}/live/tournament/${match.tournament.slug}`} className="font-bold text-accent hover:underline">
                  {match.tournament.name}
                </Link>
              ) : (
                <span className="font-bold text-accent">{t("friendly")}</span>
              )}
              {meta.length > 0 && <span className="block text-xs">{meta.join(", ")}</span>}
            </p>
            <StatusPill status={match.status} />
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 md:mt-8 md:gap-8">
            {boardSide(match.teamA)}
            <span aria-hidden className="display mt-5 text-3xl text-fg/70 md:mt-8 md:text-5xl">
              {t("vs")}
            </span>
            {boardSide(match.teamB)}
          </div>

          <p className={cn("display mx-auto mt-6 max-w-3xl text-center text-2xl md:mt-8 md:text-4xl", result ? "text-accent" : "text-fg")}>{headline}</p>

          <div className="mt-5 flex justify-center">
            <MatchImageDialog
              match={match}
              labels={imageLabels}
              text={{
                open: t("image_open"),
                title: t("image_title"),
                summary: t("image_summary"),
                board: t("image_board"),
                download: t("image_download"),
                share: t("image_share"),
                close: t("close"),
              }}
            />
          </div>
        </div>
      </section>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "live", label: t(isLive ? "tab_live" : "tab_summary") },
          { key: "scorecard", label: t("tab_scorecard") },
          { key: "overs", label: t("tab_overs") },
          { key: "squads", label: t("tab_squads") },
        ]}
      />

      {tab === "live" && livePanel()}
      {tab === "scorecard" && scorecard()}
      {tab === "overs" && overs()}
      {tab === "squads" && squads()}
    </div>
  );
}
