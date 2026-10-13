import { setRequestLocale } from "next-intl/server";
import LivePageShell, { liveMetadata } from "@/components/live/LivePageShell";
import TeamView from "@/components/live/TeamView";
import { teamTitle } from "@/lib/cricket/meta";

export async function generateMetadata({ params }: PageProps<"/[locale]/live/team/[id]">) {
  const { locale, id } = await params;
  return liveMetadata(locale, `/live/team/${id}`, await teamTitle(id));
}

export default async function TeamPage({ params }: PageProps<"/[locale]/live/team/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <LivePageShell locale={locale} current={(await teamTitle(id)) ?? "—"}>
      <TeamView id={id} />
    </LivePageShell>
  );
}
