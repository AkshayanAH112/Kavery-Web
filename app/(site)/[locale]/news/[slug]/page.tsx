import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Lightbox } from "@/components/site/Lightbox";
import { PageShell, formatDate } from "@/components/site/PageShell";
import { getPublishedPost } from "@/lib/content/public";
import { htmlToText } from "@/lib/content/sanitize";

export async function generateMetadata({ params }: PageProps<"/[locale]/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  // A draft or a missing post gets a generic title and stays out of search results.
  if (!post) return { title: "Kavery Sports Club", robots: { index: false, follow: true } };
  return { title: `${post.title} | Kavery Sports Club`, description: post.excerpt || htmlToText(post.content).slice(0, 160), openGraph: post.coverUrl ? { images: [post.coverUrl] } : undefined };
}

export default async function PostPage({ params }: PageProps<"/[locale]/news/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPublishedPost(slug);
  if (!post) notFound();
  const t = await getTranslations();

  return (
    <PageShell
      narrow
      crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("news.eyebrow"), href: `/${locale}/news` }, { label: post.title }]}
      eyebrow={post.org === "keda" ? t("news.keda") : t("news.ksc")}
      title={post.title}
      lead={post.excerpt ?? undefined}
    >
      <p className="-mt-4 mb-8 text-sm text-muted-foreground">
        {post.publishedAt && formatDate(post.publishedAt, locale)} · {post.author}
      </p>
      {post.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
        <img src={post.coverUrl} alt="" className="mb-10 aspect-[16/9] w-full rounded-[var(--card-radius)] object-cover" />
      )}
      {/* The body was sanitised against an allow-list when it was saved (lib/content/sanitize.ts). */}
      <div
        className="prose prose-invert prose-lg max-w-none prose-a:text-accent prose-headings:font-sans prose-headings:font-bold"
        lang={locale}
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
      {post.images.length > 0 && (
        <section className="mt-14">
          <h2 className="eyebrow mb-5 text-accent">{t("gallery.eyebrow")}</h2>
          <Lightbox
            photos={post.images.map((img, i) => ({ id: img.key ?? String(i), url: img.url, caption: img.caption }))}
            labels={{ open: t("gallery.openPhoto"), close: t("gallery.close"), previous: t("gallery.previous"), next: t("gallery.next") }}
          />
        </section>
      )}
    </PageShell>
  );
}
