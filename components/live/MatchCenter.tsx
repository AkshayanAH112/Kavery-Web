"use client";

import { useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { BatterLine } from "@/lib/cricket/engine";
import type { MatchView, TeamBrief } from "@/lib/cricket/view";
import { cn } from "@/lib/utils";
import { BallChip, EmptyNote, PollStatus, SectionTitle, StatusPill, Tabs, TeamLogo, formatMatchDate, usePolling, useResultText } from "./shared";

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
    <div className="rounded-xl bg-surface-2/60 px-3 py-2.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums text-fg">{value}</p>
    </div>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat(t("crr"), current.runRate ?? "—")}
          {match.chase && stat(t("target"), match.chase.target)}
          {match.chase && isLive && stat(t("rrr"), match.chase.requiredRate ?? "—")}
          {stand && isLive && stat(t("partnership"), t("partnership_value", { runs: stand.runs, balls: stand.balls }))}
          {stat(t("extras"), current.extras.total)}
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

  return (
    <div>
      {status}

      {/* Scoreboard */}
      <div className="live-card mb-6 rounded-2xl p-5 shadow-lg md:p-7">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[11px] font-bold uppercase leading-relaxed tracking-widest text-muted-foreground">
            {match.tournament ? (
              <Link href={`/${locale}/live/tournament/${match.tournament.slug}`} className="text-accent hover:underline">
                {match.tournament.name}
              </Link>
            ) : (
              <span className="text-accent">{t("friendly")}</span>
            )}
            {meta.length > 0 && <span> · {meta.join(" · ")}</span>}
          </p>
          <StatusPill status={match.status} />
        </div>

        <div className="mt-5 space-y-4">
          {[match.teamA, match.teamB].map((side) => {
            const lines = match.innings.filter((inn) => inn.battingTeam === side.id);
            const batting = isLive && current?.battingTeam === side.id;
            const won = match.result?.winner === side.id;
            return (
              <div key={side.id} className="flex items-center gap-3 md:gap-4">
                <TeamLogo team={side} size={44} />
                <Link
                  href={`/${locale}/live/team/${side.id}`}
                  className={cn("min-w-0 flex-1 truncate text-lg font-bold hover:underline md:text-xl", won || batting ? "text-accent" : "text-fg")}
                >
                  {side.name}
                </Link>
                {lines.length > 0 ? (
                  <p className="shrink-0 text-right">
                    <span className="font-display text-3xl font-extrabold lining-nums tabular-nums text-fg md:text-4xl">
                      {lines.map((inn) => `${inn.runs}/${inn.wickets}`).join(" & ")}
                    </span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {lines[lines.length - 1].overs} {t("overs_unit")}
                    </span>
                  </p>
                ) : (
                  <span className="shrink-0 text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>

        <p className={cn("mt-5 border-t border-line pt-4 text-sm leading-relaxed", result ? "font-bold text-accent" : "text-fg")}>
          {headline}
        </p>
      </div>

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
