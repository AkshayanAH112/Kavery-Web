"use client";

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MatchCard } from "@/lib/cricket/view";
import { EmptyNote, MatchCardLink, PollStatus, SectionTitle, usePolling } from "./shared";

export type LiveHomePayload = {
  live: MatchCard[];
  upcoming: MatchCard[];
  results: MatchCard[];
  tournaments: { name: string; slug: string; season: string | null; status: string; teamCount: number }[];
};

export default function LiveHome({ initial }: { initial?: LiveHomePayload | null }) {
  const t = useTranslations("Live");
  const locale = useLocale();
  // Quicker while something is being played, so a wicket shows on the home
  // cards without the visitor opening the match.
  const { data, state, offline } = usePolling<LiveHomePayload>("/api/public/cricket", (d) => (d?.live.length ? 10_000 : 30_000), initial);

  const status = <PollStatus state={state} offline={offline} notFoundKey="not_found_match" />;
  if (!data) return status;

  const empty = !data.live.length && !data.upcoming.length && !data.results.length && !data.tournaments.length;
  if (empty) {
    return (
      <div className="live-card rounded-2xl p-10 text-center">
        <h2 className="font-display text-2xl font-bold text-fg">{t("nothing_title")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t("nothing_body")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      {status}

      <section>
        <SectionTitle count={data.live.length || undefined}>{t("live_now")}</SectionTitle>
        {data.live.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{data.live.map((m) => <MatchCardLink key={m.id} match={m} />)}</div>
        ) : (
          <EmptyNote>{t("no_live")}</EmptyNote>
        )}
      </section>

      {data.tournaments.length > 0 && (
        <section>
          <SectionTitle>{t("tournaments")}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.tournaments.map((tournament) => (
              <Link
                key={tournament.slug}
                href={`/${locale}/live/tournament/${tournament.slug}`}
                className="live-card flex items-center gap-4 rounded-2xl p-4 shadow-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                  <Trophy size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-fg">{tournament.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[tournament.season, t(`tournament_${tournament.status}`), t("teams_count", { count: tournament.teamCount })].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{t("upcoming")}</SectionTitle>
        {data.upcoming.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{data.upcoming.map((m) => <MatchCardLink key={m.id} match={m} />)}</div>
        ) : (
          <EmptyNote>{t("no_upcoming")}</EmptyNote>
        )}
      </section>

      <section>
        <SectionTitle>{t("results")}</SectionTitle>
        {data.results.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{data.results.map((m) => <MatchCardLink key={m.id} match={m} />)}</div>
        ) : (
          <EmptyNote>{t("no_results")}</EmptyNote>
        )}
      </section>
    </div>
  );
}
