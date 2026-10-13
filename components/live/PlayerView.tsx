"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { PlayerRole } from "@/lib/cricket/engine";
import type { PlayerTotals, TeamBrief } from "@/lib/cricket/view";
import { EmptyNote, PollStatus, SectionTitle, TeamLogo, formatDay, usePolling } from "./shared";

type Payload = {
  player: { id: string; name: string; role: PlayerRole; isCaptain: boolean; isKeeper: boolean };
  team: TeamBrief;
  totals: PlayerTotals | null;
  log: {
    matchId: string;
    startAt: string | null;
    opponent: TeamBrief;
    batting: { runs: number; balls: number; out: boolean } | null;
    bowling: { overs: string; runs: number; wickets: number } | null;
  }[];
};

export default function PlayerView({ id }: { id: string }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  const { data, state, offline } = usePolling<Payload>(`/api/public/cricket/players/${id}`, (d) => (d ? null : 10_000));

  const status = <PollStatus state={state} offline={offline} notFoundKey="not_found_player" />;
  if (!data) return status;
  const { player, team, totals, log } = data;

  const tiles = (title: string, items: [string, React.ReactNode][]) => (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="live-card rounded-xl px-3 py-3.5 text-center">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-extrabold lining-nums tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  const tags = [t(`role_${player.role}`), player.isCaptain ? t("captain") : null, player.isKeeper && player.role !== "wicket_keeper" ? t("keeper") : null].filter(Boolean);

  return (
    <div className="flex flex-col gap-10">
      {status}
      <header>
        <h1 className="font-display text-3xl font-extrabold leading-tight wrap-break-word text-fg md:text-4xl">{player.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <Link href={`/${locale}/live/team/${team.id}`} className="flex items-center gap-2 font-bold text-accent hover:underline">
            <TeamLogo team={team} size={24} />
            {team.name}
          </Link>
          <span>{tags.join(" · ")}</span>
        </div>
      </header>

      {!totals || totals.matches === 0 ? (
        <EmptyNote>{t("did_not_play_yet")}</EmptyNote>
      ) : (
        <>
          {tiles(t("batting_title"), [
            [t("matches"), totals.matches],
            [t("innings"), totals.batting.innings],
            [t("runs"), totals.batting.runs],
            // The asterisk is the scorebook mark for a not-out top score.
            [t("highest"), `${totals.batting.highest}${totals.batting.highestNotOut ? "*" : ""}`],
            [t("average"), totals.batting.average ?? "—"],
            [t("strike_rate"), totals.batting.strikeRate ?? "—"],
            [t("fours"), totals.batting.fours],
            [t("sixes"), totals.batting.sixes],
          ])}

          {totals.bowling.balls > 0 &&
            tiles(t("bowling_title"), [
              [t("overs"), totals.bowling.overs],
              [t("wickets"), totals.bowling.wickets],
              [t("best"), `${totals.bowling.bestWickets}/${totals.bowling.bestRuns}`],
              [t("economy"), totals.bowling.economy ?? "—"],
              [t("average"), totals.bowling.average ?? "—"],
              [t("maidens"), totals.bowling.maidens],
              [t("runs_given"), totals.bowling.runs],
              [t("dot_balls"), totals.bowling.dots],
            ])}

          {tiles(t("fielding_title"), [
            [t("catches"), totals.fielding.catches],
            [t("stumpings"), totals.fielding.stumpings],
            [t("run_outs"), totals.fielding.runOuts],
            ["MVP", totals.mvp],
          ])}

          <section>
            <SectionTitle>{t("match_by_match")}</SectionTitle>
            <div className="live-card overflow-hidden rounded-2xl">
              <ul className="divide-y divide-line">
                {log.map((line) => (
                  <li key={line.matchId}>
                    <Link href={`/${locale}/live/match/${line.matchId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40">
                      <TeamLogo team={line.opponent} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-fg">
                          {t("versus")} {line.opponent.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">{formatDay(line.startAt) ?? t("date_tbc")}</span>
                      </span>
                      <span className="shrink-0 text-right text-sm tabular-nums">
                        <span className="block font-bold text-fg">
                          {line.batting ? `${line.batting.runs}${line.batting.out ? "" : "*"} (${line.batting.balls})` : "—"}
                        </span>
                        {line.bowling && (
                          <span className="block text-xs text-muted-foreground">
                            {line.bowling.wickets}/{line.bowling.runs} ({line.bowling.overs})
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
