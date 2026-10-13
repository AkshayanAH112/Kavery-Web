import { setRequestLocale } from "next-intl/server";
import LivePageShell, { liveMetadata } from "@/components/live/LivePageShell";
import PlayerView from "@/components/live/PlayerView";
import { playerTitle } from "@/lib/cricket/meta";

export async function generateMetadata({ params }: PageProps<"/[locale]/live/player/[id]">) {
  const { locale, id } = await params;
  return liveMetadata(locale, `/live/player/${id}`, await playerTitle(id));
}

export default async function PlayerPage({ params }: PageProps<"/[locale]/live/player/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <LivePageShell locale={locale} current={(await playerTitle(id)) ?? "—"}>
      <PlayerView id={id} />
    </LivePageShell>
  );
}
