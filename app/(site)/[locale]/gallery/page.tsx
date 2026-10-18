import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrgTabs } from "@/components/site/OrgTabs";
import { PageShell } from "@/components/site/PageShell";
import { getGallery, orgFilter } from "@/lib/content/public";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gallery" });
  const clubName = locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club";
  const title = `${t("eyebrow")} | ${clubName}`;
  const description = locale === "ta"
    ? "காவேரி விளையாட்டுக் கழகம் மற்றும் கல்வி ஒன்றியத்தின் விளையாட்டு நிகழ்வுகள், போட்டிகள் மற்றும் வரலாற்றுப் புகைப்படத் தொகுப்பு."
    : "Photo albums and memories from cricket tournaments, training sessions, and events at Kavery Sports Club.";
  const ogImage = locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/gallery`,
      languages: { en: "/en/gallery", ta: "/ta/gallery", "x-default": "/en/gallery" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/gallery`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function GalleryPage({ params, searchParams }: PageProps<"/[locale]/gallery">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const org = orgFilter((await searchParams).org);
  const [t, entries] = await Promise.all([getTranslations(), getGallery(org)]);

  return (
    <PageShell crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("gallery.eyebrow") }]} eyebrow={t("gallery.eyebrow")} title={t("gallery.title")}>
      <OrgTabs base={`/${locale}/gallery`} current={org} labels={{ all: t("news.tabAll"), ksc: t("news.ksc"), keda: t("news.keda") }} />
      {entries.length === 0 ? (
        <p className="live-card p-8 text-muted-foreground">{t("gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`}>
              <Link
                href={entry.kind === "post" ? `/${locale}/news/${entry.slug}#photos` : `/${locale}/gallery/${entry.id}`}
                className="group relative block aspect-[4/3] overflow-hidden rounded-[var(--card-radius)] bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- already resized before upload */}
                <img src={entry.coverUrl} alt={entry.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                {entry.kind === "post" && (
                  <span className="absolute left-3 top-3 rounded-sm bg-black/70 px-2 py-1 text-xs font-semibold text-accent">{t("gallery.fromNews")}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-12">
                  <span className="line-clamp-2 font-semibold text-white">{entry.name}</span>
                  <span className="block text-sm text-white/75">{t("gallery.photos", { count: entry.imageCount })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
