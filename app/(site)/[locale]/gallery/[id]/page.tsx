import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Lightbox } from "@/components/site/Lightbox";
import { PageShell } from "@/components/site/PageShell";
import { getAlbum } from "@/lib/content/public";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery/[id]">): Promise<Metadata> {
  const album = await getAlbum((await params).id);
  if (!album) return { title: "Kavery Sports Club", robots: { index: false, follow: true } };
  return { title: `${album.folder.name} | Kavery Sports Club`, openGraph: album.folder.coverUrl ? { images: [album.folder.coverUrl] } : undefined };
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
