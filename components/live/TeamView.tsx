"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { PlayerRole } from "@/lib/cricket/engine";
import type { MatchCard, TeamBrief } from "@/lib/cricket/view";
import { EmptyNote, MatchCardLink, PollStatus, SectionTitle, TeamLogo, usePolling } from "./shared";

type Payload = {
  team: TeamBrief;
  players: { id: string; name: string; role: PlayerRole; isCaptain: boolean; isKeeper: boolean }[];
  matches: MatchCard[];
  tournaments: { name: string; slug: string; season: string | null }[];
};

export default function TeamView({ id }: { id: string }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  // A squad page has nothing ticking on it — one fetch, refreshed only if the
  // visitor leaves the tab and comes back.
  const { data, state, offline } = usePolling<Payload>(`/api/public/cricket/teams/${id}`, (d) => (d ? null : 10_000));

  const status = <PollStatus state={state} offline={offline} notFoundKey="not_found_team" />;
  if (!data) return status;
  const { team, players, matches, tournaments } = data;

  return (
    <div className="flex flex-col gap-10">
      {status}
      <header className="flex items-center gap-4">
        <TeamLogo team={team} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold leading-tight wrap-break-word text-fg md:text-4xl">{team.name}</h1>
          {tournaments.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {tournaments.map((tournament) => (
                <Link key={tournament.slug} href={`/${locale}/live/tournament/${tournament.slug}`} className="text-accent hover:underline">
                  {tournament.name}
                  {tournament.season ? ` ${tournament.season}` : ""}
                </Link>
              ))}
            </p>
          )}
        </div>
      </header>

      <section>
        <SectionTitle count={players.length || undefined}>{t("squad")}</SectionTitle>
        {players.length === 0 ? (
          <EmptyNote>{t("squad_empty")}</EmptyNote>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {players.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/live/player/${p.id}`}
                  className="live-card flex min-w-0 items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="min-w-0 truncate font-bold text-fg">
                    {p.name}
                    {p.isCaptain && <span className="ml-1.5 text-xs font-normal text-accent" title={t("captain")}>(c)</span>}
                    {p.isKeeper && <span className="ml-1.5 text-xs font-normal text-accent" title={t("keeper")}>(wk)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`role_${p.role}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>{t("matches")}</SectionTitle>
        {matches.length === 0 ? (
          <EmptyNote>{t("did_not_play_yet")}</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{matches.map((m) => <MatchCardLink key={m.id} match={m} />)}</div>
        )}
      </section>
    </div>
  );
}
