import { setRequestLocale } from "next-intl/server";
import LivePageShell, { liveMetadata } from "@/components/live/LivePageShell";
import TournamentView from "@/components/live/TournamentView";
import { tournamentTitle } from "@/lib/cricket/meta";

export async function generateMetadata({ params }: PageProps<"/[locale]/live/tournament/[slug]">) {
  const { locale, slug } = await params;
  return liveMetadata(locale, `/live/tournament/${slug}`, await tournamentTitle(slug));
}

export default async function TournamentPage({ params }: PageProps<"/[locale]/live/tournament/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return (
    <LivePageShell locale={locale} current={(await tournamentTitle(slug)) ?? "—"}>
      <TournamentView slug={slug} />
    </LivePageShell>
  );
}
