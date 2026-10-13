import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { HomeMatch } from "@/lib/site";
import { TIME_ZONE } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

export function formatMatchTime(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale === "ta" ? "ta-LK" : "en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
}

export async function resultLine(match: HomeMatch) {
  const t = await getTranslations("matches");
  const r = match.result;
  if (!r) return null;
  if (r.outcome === "tie") return t("tie");
  if (r.outcome === "no_result") return t("noResult");
  if (r.outcome === "abandoned") return t("abandoned");
  const team = match.sides.find((s) => s.id === r.winner)?.name;
  if (!team || !r.margin) return null;
  return r.by === "wickets" ? t("wonByWickets", { team, margin: r.margin }) : t("wonByRuns", { team, margin: r.margin });
}

export async function StatusChip({ status }: { status: string }) {
  const t = await getTranslations("matches");
  if (status === "live" || status === "innings_break") {
    return (
      <span className="inline-flex items-center gap-2 bg-brand px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-on-brand">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-on-brand" aria-hidden />
        {status === "live" ? t("live") : t("break")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex px-2.5 py-1 text-xs font-bold uppercase tracking-wider", status === "upcoming" ? "bg-accent text-on-accent" : "border border-line text-muted-foreground")}>
      {status === "upcoming" ? t("upcoming") : t("result")}
    </span>
  );
}

export async function MatchCard({ match, locale }: { match: HomeMatch; locale: string }) {
  const [t, tt] = await Promise.all([getTranslations("matches"), getTranslations("ticker")]);
  const footer = (await resultLine(match)) ?? (match.startAt ? formatMatchTime(match.startAt, locale) : t("tbc"));

  return (
    <Link href={`/${locale}/live/match/${match.id}`} className="group block h-full">
    <article className="flex h-full flex-col rounded-[var(--card-radius)] border border-line bg-surface p-6 transition-colors group-hover:border-fg">
      <div className="flex items-center justify-between gap-3">
        <StatusChip status={match.status} />
        <p className="truncate text-sm text-muted-foreground">{[match.tournament, match.title].filter(Boolean).join(" · ")}</p>
      </div>

      <ul className="mt-6 flex-1 space-y-4">
        {match.sides.map((side) => (
          <li key={side.id} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="h-8 w-1.5 shrink-0" style={{ background: side.color || "var(--line)" }} />
              <span className="truncate text-lg font-semibold">{side.name}</span>
            </span>
            {side.score ? (
              <span className="shrink-0 text-right">
                <span className="display text-3xl tabular-nums">
                  {side.score.runs}/{side.score.wickets}
                </span>
                <span className="ml-2 text-sm text-muted-foreground tabular-nums">{tt("overs", { overs: overs(side.score.balls) })}</span>
              </span>
            ) : (
              match.status !== "upcoming" && <span className="shrink-0 text-sm text-muted-foreground">{tt("yetToBat")}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-line pt-4 text-sm text-muted-foreground">
        {footer}
        {match.venue ? ` · ${match.venue}` : ""}
      </p>
    </article>
    </Link>
  );
}
