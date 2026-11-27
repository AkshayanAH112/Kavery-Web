import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BellRing } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NoticeCard } from "@/components/site/NoticeCard";
import { PageShell, formatDate, shareLabels } from "@/components/site/PageShell";
import { Poster, SavePosterButton } from "@/components/site/Poster";
import { ShareButton } from "@/components/site/ShareButton";
import { getNotice, recentNotices } from "@/lib/notices";

export async function generateMetadata({ params }: PageProps<"/[locale]/notices/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const notice = await getNotice(id);
  if (!notice) return { title: "Kavery Sports Club", robots: { index: false, follow: true } };

  const title = `${notice.title} | ${locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club"}`;
  const description = notice.body ?? undefined;
  return {
    title,
    description,
    // A staff-only poster is reachable only with a staff session and never belongs in a search engine.
    robots: notice.topic === "staff" ? { index: false, follow: false } : undefined,
    alternates: { canonical: `/${locale}/notices/${id}`, languages: { en: `/en/notices/${id}`, ta: `/ta/notices/${id}`, "x-default": `/en/notices/${id}` } },
    // The poster itself is the preview when the link is shared on WhatsApp or Facebook.
    openGraph: { type: "article", title, description, url: `/${locale}/notices/${id}`, images: [{ url: notice.image, alt: notice.title }] },
    twitter: { card: "summary_large_image", title, description, images: [notice.image] },
  };
}

export default async function NoticePage({ params }: PageProps<"/[locale]/notices/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const notice = await getNotice(id);
  if (!notice) notFound();
  const t = await getTranslations();

  const earlier = notice.topic === "staff" ? [] : await recentNotices({ limit: 4, except: notice.id });
  // A staff link may carry "{locale}", like a push link does.
  const link = notice.link?.replace("{locale}", locale) ?? null;
  const fileName = `kavery-notice-${notice.sentAt.toISOString().slice(0, 10)}`;
  const alt = t("Notices.poster_alt", { title: notice.title });
  const save = { save: t("Notices.save"), saving: t("Notices.saving") };

  return (
    <PageShell
      narrow
      crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("Notices.eyebrow"), href: `/${locale}/notices` }, { label: notice.title }]}
      eyebrow={`${t(`Notices.topic_${notice.topic}`)} · ${formatDate(notice.sentAt, locale)}`}
      title={notice.title}
      lead={notice.body ?? undefined}
    >
      <Poster
        src={notice.image}
        alt={alt}
        fileName={fileName}
        labels={{
          open: t("Notices.open"),
          tapToZoom: t("Notices.tap_zoom"),
          close: t("Notices.close"),
          zoomIn: t("Notices.zoom_in"),
          zoomOut: t("Notices.zoom_out"),
          fit: t("Notices.fit"),
          hint: t("Notices.zoom_hint"),
          viewerHint: t("Notices.viewer_hint"),
          ...save,
        }}
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <SavePosterButton src={notice.image} fileName={fileName} title={notice.title} labels={save} />
        {notice.topic !== "staff" && <ShareButton path={`/${locale}/notices/${notice.id}`} title={notice.title} labels={shareLabels(t)} />}
        {link && (
          <Link href={link} className="btn btn-ghost">
            <span>
              {t("Notices.more")} <ArrowRight size={18} aria-hidden />
            </span>
          </Link>
        )}
      </div>

      {earlier.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="eyebrow text-accent">{t("Notices.earlier")}</h2>
            <Link href={`/${locale}/notices`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-fg">
              {t("Notices.all")} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {earlier.map((n) => (
              <NoticeCard key={n.id} notice={n} locale={locale} topicLabel={t(`Notices.topic_${n.topic}`)} alt={t("Notices.poster_alt", { title: n.title })} />
            ))}
          </div>
        </section>
      )}

      {notice.topic !== "staff" && (
        <a href={`/${locale}#app`} className="btn btn-accent mt-12">
          <span>
            <BellRing size={18} aria-hidden /> {t("Notices.alerts_cta")}
          </span>
        </a>
      )}
    </PageShell>
  );
}
