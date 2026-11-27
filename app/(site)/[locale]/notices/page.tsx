import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NoticeCard } from "@/components/site/NoticeCard";
import { PageShell } from "@/components/site/PageShell";
import { recentNotices } from "@/lib/notices";

export async function generateMetadata({ params }: PageProps<"/[locale]/notices">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Notices" });
  const title = `${t("meta_title")} | ${locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club"}`;
  return {
    title,
    description: t("meta_description"),
    alternates: { canonical: `/${locale}/notices`, languages: { en: "/en/notices", ta: "/ta/notices", "x-default": "/en/notices" } },
    openGraph: { title, description: t("meta_description"), url: `/${locale}/notices` },
  };
}

export default async function NoticesPage({ params }: PageProps<"/[locale]/notices">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const notices = await recentNotices({ limit: 60 });

  return (
    <PageShell crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("Notices.eyebrow") }]} eyebrow={t("Notices.eyebrow")} title={t("Notices.title")} lead={t("Notices.lead")}>
      {notices.length === 0 ? (
        <p className="live-card p-8 text-lg text-muted-foreground">{t("Notices.empty")}</p>
      ) : (
        // Columns, not a grid: each poster keeps its own shape and the cards pack under one another.
        <div className="columns-1 gap-5 min-[480px]:columns-2 lg:columns-3 [&>*]:mb-5">
          {notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              whole
              notice={notice}
              locale={locale}
              topicLabel={t(`Notices.topic_${notice.topic}`)}
              alt={t("Notices.poster_alt", { title: notice.title })}
            />
          ))}
        </div>
      )}
      <a href={`/${locale}#app`} className="btn btn-accent mt-10">
        <span>
          <BellRing size={18} aria-hidden /> {t("Notices.alerts_cta")}
        </span>
      </a>
    </PageShell>
  );
}
