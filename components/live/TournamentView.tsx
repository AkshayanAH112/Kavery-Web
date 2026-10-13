"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MatchCard, PlayerTotals, PointsRow, TeamBrief } from "@/lib/cricket/view";
import { cn } from "@/lib/utils";
import { EmptyNote, MatchCardLink, PollStatus, SectionTitle, Tabs, TeamLogo, formatDay, usePolling } from "./shared";

type Payload = {
  tournament: {
    name: string;
    slug: string;
    season: string | null;
    venue: string | null;
    status: string;
    oversPerInnings: number | null;
    startDate: string | null;
    endDate: string | null;
    points: { win: number; tie: number; noResult: number };
  };
  teams: TeamBrief[];
  matches: MatchCard[];
  table: PointsRow[];
  stats: {
    players: Record<string, { name: string; team: string }>;
    totals: PlayerTotals[];
    mvpPoints: Record<string, number>;
  };
};

type Tab = "matches" | "table" | "stats" | "teams";

const FORM_STYLE: Record<PointsRow["form"][number], string> = {
  W: "bg-accent text-on-accent",
  L: "bg-surface-2 text-fg",
  T: "bg-surface-2 text-fg",
  N: "bg-surface-2 text-muted-foreground",
};

// Tight on a phone so all eight figures fit 390px without scrolling sideways —
// a points table whose Pts column is off-screen is not doing its job.
const th = "px-1.5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:px-2";
const td = "px-1.5 py-3 text-right tabular-nums text-muted-foreground sm:px-2";

export default function TournamentView({ slug }: { slug: string }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("matches");

  const { data, state, offline } = usePolling<Payload>(`/api/public/cricket/tournaments/${encodeURIComponent(slug)}`, (d) =>
    // A live match moves the table when it ends; otherwise there is no hurry.
    d?.matches.some((m) => m.status === "live" || m.status === "innings_break") ? 15_000 : 60_000
  );

  const status = <PollStatus state={state} offline={offline} notFoundKey="not_found_tournament" />;
  if (!data) return status;
  const { tournament, teams, matches, table, stats } = data;
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const live = matches.filter((m) => m.status === "live" || m.status === "innings_break");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const finished = matches.filter((m) => m.status === "completed" || m.status === "abandoned").reverse();

  const matchesPanel = () =>
    matches.length === 0 ? (
      <EmptyNote>{t("no_upcoming")}</EmptyNote>
    ) : (
      <div className="flex flex-col gap-10">
        {live.length > 0 && (
          <section>
            <SectionTitle count={live.length}>{t("live_now")}</SectionTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{live.map((m) => <MatchCardLink key={m.id} match={m} showTournament={false} />)}</div>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <SectionTitle>{t("upcoming")}</SectionTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{upcoming.map((m) => <MatchCardLink key={m.id} match={m} showTournament={false} />)}</div>
          </section>
        )}
        {finished.length > 0 && (
          <section>
            <SectionTitle>{t("results")}</SectionTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{finished.map((m) => <MatchCardLink key={m.id} match={m} showTournament={false} />)}</div>
          </section>
        )}
      </div>
    );

  const tablePanel = () =>
    table.length === 0 ? (
      <EmptyNote>{t("table_empty")}</EmptyNote>
    ) : (
      <div className="flex flex-col gap-4">
        <div className="live-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/40">
                <tr>
                  <th className={cn(th, "w-6 pl-3 text-left sm:w-8 sm:pl-4")}>#</th>
                  <th className={cn(th, "text-left")}>{t("team")}</th>
                  <th className={th}>P</th>
                  <th className={th}>W</th>
                  <th className={th}>L</th>
                  <th className={th}>T</th>
                  <th className={th}>NR</th>
                  <th className={th}>Pts</th>
                  <th className={cn(th, "pr-3 sm:pr-2")}>NRR</th>
                  <th className={cn(th, "hidden pr-4 text-left sm:table-cell")}>{t("form")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.map((row, i) => {
                  const team = teamById.get(row.team);
                  if (!team) return null;
                  return (
                    <tr key={row.team}>
                      <td className="py-3 pl-3 pr-1.5 tabular-nums text-muted-foreground sm:pl-4 sm:pr-2">{i + 1}</td>
                      <td className="px-1.5 py-3 sm:px-2">
                        {/* Short name on a phone: a full club name would take the
                            width of four number columns. */}
                        <Link href={`/${locale}/live/team/${team.id}`} title={team.name} className="flex items-center gap-2 font-bold text-fg hover:underline sm:gap-2.5">
                          <TeamLogo team={team} size={26} />
                          <span className="sm:hidden">{team.shortName}</span>
                          <span className="hidden sm:inline">{team.name}</span>
                        </Link>
                      </td>
                      <td className={td}>{row.played}</td>
                      <td className={td}>{row.won}</td>
                      <td className={td}>{row.lost}</td>
                      <td className={td}>{row.tied}</td>
                      <td className={td}>{row.noResult}</td>
                      <td className={cn(td, "font-bold text-accent")}>{row.points}</td>
                      <td className={cn(td, "pr-3 sm:pr-2")}>{row.netRunRate > 0 ? `+${row.netRunRate.toFixed(3)}` : row.netRunRate.toFixed(3)}</td>
                      <td className="hidden py-3 pl-2 pr-4 sm:table-cell">
                        <span className="flex gap-1">
                          {row.form.map((f, j) => (
                            <span key={j} className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", FORM_STYLE[f])}>
                              {f}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <Note>{t("table_note", tournament.points)}</Note>
      </div>
    );

  // Each board is the same list sorted a different way; a player with nothing
  // in a category is left off it rather than ranked on zero.
  const board = (
    title: string,
    value: (p: PlayerTotals) => number,
    detail: (p: PlayerTotals) => string,
    tiebreak: (a: PlayerTotals, b: PlayerTotals) => number = () => 0
  ) => {
    const rows = stats.totals.filter((p) => value(p) > 0).sort((a, b) => value(b) - value(a) || tiebreak(a, b)).slice(0, 10);
    return (
      <section className="live-card overflow-hidden rounded-2xl">
        <h3 className="bg-surface-2/40 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">{title}</h3>
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">{t("stats_empty")}</p>
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((p, i) => {
              const player = stats.players[p.id];
              const team = teamById.get(player.team);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/${locale}/live/player/${p.id}`} className="block truncate text-sm font-bold text-fg hover:underline">
                      {player.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[team?.shortName, detail(p)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-xl font-extrabold lining-nums tabular-nums text-accent">{value(p)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  };

  const statsPanel = () =>
    stats.totals.length === 0 ? (
      <EmptyNote>{t("stats_empty")}</EmptyNote>
    ) : (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {board(
            t("stats_runs"),
            (p) => p.batting.runs,
            (p) => `${t("innings")} ${p.batting.innings} · ${t("average")} ${p.batting.average ?? "—"} · SR ${p.batting.strikeRate ?? "—"}`,
            (a, b) => (b.batting.strikeRate ?? 0) - (a.batting.strikeRate ?? 0)
          )}
          {board(
            t("stats_wickets"),
            (p) => p.bowling.wickets,
            (p) => `${t("overs")} ${p.bowling.overs} · ${t("economy")} ${p.bowling.economy ?? "—"} · ${t("best")} ${p.bowling.bestWickets}/${p.bowling.bestRuns}`,
            (a, b) => (a.bowling.economy ?? 99) - (b.bowling.economy ?? 99)
          )}
          {board(t("stats_sixes"), (p) => p.batting.sixes, (p) => `${t("fours")} ${p.batting.fours} · ${t("runs")} ${p.batting.runs}`)}
          {board(t("stats_mvp"), (p) => p.mvp, (p) => `${t("runs")} ${p.batting.runs} · ${t("wickets")} ${p.bowling.wickets}`)}
        </div>
        <Note>{t("mvp_note", stats.mvpPoints)}</Note>
      </div>
    );

  const teamsPanel = () =>
    teams.length === 0 ? (
      <EmptyNote>{t("no_teams")}</EmptyNote>
    ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/${locale}/live/team/${team.id}`}
            className="live-card flex items-center gap-4 rounded-2xl p-4 shadow-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <TeamLogo team={team} size={44} />
            <span className="min-w-0 flex-1 truncate font-bold text-fg">{team.name}</span>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    );

  const dates = [formatDay(tournament.startDate), formatDay(tournament.endDate)].filter(Boolean).join(" – ");
  const meta = [
    tournament.season,
    t(`tournament_${tournament.status}`),
    tournament.oversPerInnings ? t("overs_a_side", { overs: tournament.oversPerInnings }) : null,
    tournament.venue,
    dates,
  ].filter(Boolean);

  return (
    <div>
      {status}
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold leading-tight wrap-break-word text-fg md:text-4xl">{tournament.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{meta.join(" · ")}</p>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "matches", label: t("tab_matches") },
          { key: "table", label: t("tab_table") },
          { key: "stats", label: t("tab_stats") },
          { key: "teams", label: t("tab_teams") },
        ]}
      />

      {tab === "matches" && matchesPanel()}
      {tab === "table" && tablePanel()}
      {tab === "stats" && statsPanel()}
      {tab === "teams" && teamsPanel()}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/30 p-4">
      <Info size={16} className="mt-0.5 shrink-0 text-accent" />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
