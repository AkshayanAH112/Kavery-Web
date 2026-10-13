import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrgTabs } from "@/components/site/OrgTabs";
import { PageShell } from "@/components/site/PageShell";
import { getAlbums, orgFilter } from "@/lib/content/public";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gallery" });
  return { title: `${t("eyebrow")} | Kavery Sports Club`, alternates: { languages: { en: "/en/gallery", ta: "/ta/gallery", "x-default": "/en/gallery" } } };
}

export default async function GalleryPage({ params, searchParams }: PageProps<"/[locale]/gallery">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const org = orgFilter((await searchParams).org);
  const [t, albums] = await Promise.all([getTranslations(), getAlbums(org)]);

  return (
    <PageShell crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("gallery.eyebrow") }]} eyebrow={t("gallery.eyebrow")} title={t("gallery.title")}>
      <OrgTabs base={`/${locale}/gallery`} current={org} labels={{ all: t("news.tabAll"), ksc: t("news.ksc"), keda: t("news.keda") }} />
      {albums.length === 0 ? (
        <p className="live-card p-8 text-muted-foreground">{t("gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {albums.map((album) => (
            <li key={album.id}>
              <Link href={`/${locale}/gallery/${album.id}`} className="group relative block aspect-[4/3] overflow-hidden rounded-[var(--card-radius)] bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- already resized before upload */}
                <img src={album.coverUrl!} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-12">
                  <span className="block font-semibold text-white">{album.name}</span>
                  <span className="block text-sm text-white/75">{t("gallery.photos", { count: album.imageCount })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
