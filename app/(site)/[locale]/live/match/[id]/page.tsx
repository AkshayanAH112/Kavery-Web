import { setRequestLocale } from "next-intl/server";
import LivePageShell, { liveMetadata } from "@/components/live/LivePageShell";
import MatchCenter from "@/components/live/MatchCenter";
import { matchTitle } from "@/lib/cricket/meta";

export async function generateMetadata({ params }: PageProps<"/[locale]/live/match/[id]">) {
  const { locale, id } = await params;
  return liveMetadata(locale, `/live/match/${id}`, await matchTitle(id));
}

export default async function MatchCenterPage({ params }: PageProps<"/[locale]/live/match/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <LivePageShell locale={locale} current={(await matchTitle(id)) ?? "—"}>
      <MatchCenter id={id} />
    </LivePageShell>
  );
}
