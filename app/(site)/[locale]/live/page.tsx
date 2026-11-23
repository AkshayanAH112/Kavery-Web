import { getTranslations, setRequestLocale } from "next-intl/server";
import LiveHome from "@/components/live/LiveHome";
import LivePageShell, { liveMetadata } from "@/components/live/LivePageShell";
import { liveHomePayload } from "@/lib/cricket/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/live">) {
  return liveMetadata((await params).locale, "/live");
}

export default async function LivePage({ params }: PageProps<"/[locale]/live">) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Rendered with the scores in it: a crawler gets fixtures and results, not "Loading".
  const [t, initial] = await Promise.all([getTranslations("Live"), liveHomePayload().catch(() => null)]);

  return (
    <LivePageShell locale={locale}>
      <header className="mb-10">
        <p className="eyebrow text-brand-text">{t("eyebrow")}</p>
        <h1 className="display h-section mt-4">
          {t("title")}
          <span className="text-accent">{t("accent")}</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("description")}</p>
      </header>
      <LiveHome initial={initial} />
    </LivePageShell>
  );
}
