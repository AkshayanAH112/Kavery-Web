import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Lightbox } from "@/components/site/Lightbox";
import { PageShell, formatDate, shareLabels } from "@/components/site/PageShell";
import { ShareButton } from "@/components/site/ShareButton";
import { getPublishedPost } from "@/lib/content/public";
import { htmlToText } from "@/lib/content/sanitize";

export async function generateMetadata({ params }: PageProps<"/[locale]/news/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPublishedPost(slug);
  // A draft or a missing post gets a generic title and stays out of search results.
  if (!post) return { title: "Kavery Sports Club", robots: { index: false, follow: true } };

  const clubName = locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club";
  const title = `${post.title} | ${clubName}`;
  const description = post.excerpt || htmlToText(post.content).slice(0, 160);
  const ogImage = post.coverUrl || (locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/news/${slug}`,
      languages: {
        en: `/en/news/${slug}`,
        ta: `/ta/news/${slug}`,
        "x-default": `/en/news/${slug}`,
      },
    },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/${locale}/news/${slug}`,
      publishedTime: post.publishedAt?.toISOString(),
      authors: [post.author],
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PostPage({ params }: PageProps<"/[locale]/news/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPublishedPost(slug);
  if (!post) notFound();
  const t = await getTranslations();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt || htmlToText(post.content).slice(0, 160),
    image: post.coverUrl ? [post.coverUrl] : ["https://periyaneelavanaikaverysports.club/brand/og-image-en.png"],
    datePublished: post.publishedAt?.toISOString(),
    author: [{ "@type": "Person", name: post.author }],
    publisher: {
      "@type": "SportsClub",
      name: "Kavery Sports Club",
      logo: {
        "@type": "ImageObject",
        url: "https://periyaneelavanaikaverysports.club/brand/ksc-crest.png",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <PageShell
        narrow
        crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("news.eyebrow"), href: `/${locale}/news` }, { label: post.title }]}
        eyebrow={post.org === "keda" ? t("news.keda") : t("news.ksc")}
        title={post.title}
        lead={post.excerpt ?? undefined}
      >
      <div className="-mt-4 mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <p className="text-sm text-muted-foreground">
          {post.publishedAt && formatDate(post.publishedAt, locale)} · {post.author}
        </p>
        <ShareButton path={`/${locale}/news/${slug}`} title={post.title} labels={shareLabels(t)} />
      </div>
      {post.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
        <img src={post.coverUrl} alt={post.title} className="mb-10 aspect-[16/9] w-full rounded-[var(--card-radius)] object-cover" />
      )}
      {/* The body was sanitised against an allow-list when it was saved (lib/content/sanitize.ts). */}
      <div
        className="prose prose-invert prose-lg max-w-none prose-a:text-accent prose-headings:font-sans prose-headings:font-bold"
        lang={locale}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
      {post.images.length > 0 && (
        <section id="photos" className="mt-14 scroll-mt-[calc(var(--nav-h)+1.5rem)]">
          <h2 className="eyebrow mb-5 text-accent">{t("gallery.eyebrow")}</h2>
          <Lightbox
            photos={post.images.map((img, i) => ({ id: img.key ?? String(i), url: img.url, caption: img.caption }))}
            labels={{ open: t("gallery.openPhoto"), close: t("gallery.close"), previous: t("gallery.previous"), next: t("gallery.next") }}
          />
        </section>
      )}
    </PageShell>
    </>
  );
}
