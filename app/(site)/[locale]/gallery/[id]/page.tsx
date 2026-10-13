import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Lightbox } from "@/components/site/Lightbox";
import { PageShell } from "@/components/site/PageShell";
import { getAlbum } from "@/lib/content/public";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery/[id]">): Promise<Metadata> {
  const { locale, id } = await params;
  const album = await getAlbum(id);
  if (!album) return { title: "Kavery Sports Club", robots: { index: false, follow: true } };

  const clubName = locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club";
  const title = `${album.folder.name} | ${clubName}`;
  const description = locale === "ta"
    ? `${album.folder.name} — காவேரி விளையாட்டுக் கழகப் புகைப்படத் தொகுப்பு (${album.images.length} புகைப்படங்கள்).`
    : `${album.folder.name} — photo album from Kavery Sports Club (${album.images.length} photos).`;
  const ogImage = album.folder.coverUrl || (locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/gallery/${id}`,
      languages: { en: `/en/gallery/${id}`, ta: `/ta/gallery/${id}`, "x-default": `/en/gallery/${id}` },
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/${locale}/gallery/${id}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: album.folder.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function AlbumPage({ params }: PageProps<"/[locale]/gallery/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const album = await getAlbum(id);
  if (!album) notFound();
  const t = await getTranslations();

  return (
    <PageShell
      crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("gallery.eyebrow"), href: `/${locale}/gallery` }, { label: album.folder.name }]}
      eyebrow={t("gallery.photos", { count: album.images.length })}
      title={album.folder.name}
    >
      <Lightbox
        photos={album.images.map((img) => ({ id: img.id, url: img.url, caption: img.caption }))}
        labels={{ open: t("gallery.openPhoto"), close: t("gallery.close"), previous: t("gallery.previous"), next: t("gallery.next") }}
      />
    </PageShell>
  );
}
