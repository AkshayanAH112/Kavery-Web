import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrgTabs } from "@/components/site/OrgTabs";
import { PageShell, formatDate } from "@/components/site/PageShell";
import { getPublishedPosts, orgFilter } from "@/lib/content/public";

export async function generateMetadata({ params }: PageProps<"/[locale]/news">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "news" });
  const title = `${t("title")} | ${locale === "ta" ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club"}`;
  const description = locale === "ta"
    ? "காவேரி விளையாட்டுக் கழகம் மற்றும் காவேரி கல்விசார் அபிவிருத்தி ஒன்றியத்தின் சமீபத்திய செய்திகள் மற்றும் அறிவிப்புகள்."
    : "Latest news, announcements, tournament updates and academy reports from Kavery Sports Club and KEDA.";
  const ogImage = locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/news`,
      languages: { en: "/en/news", ta: "/ta/news", "x-default": "/en/news" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/news`,
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

export default async function NewsPage({ params, searchParams }: PageProps<"/[locale]/news">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const org = orgFilter((await searchParams).org);
  const [t, posts] = await Promise.all([getTranslations(), getPublishedPosts(24, org)]);

  return (
    <PageShell crumbs={[{ label: t("nav.home"), href: `/${locale}` }, { label: t("news.eyebrow") }]} eyebrow={t("news.eyebrow")} title={t("news.title")}>
      <OrgTabs base={`/${locale}/news`} current={org} labels={{ all: t("news.tabAll"), ksc: t("news.ksc"), keda: t("news.keda") }} />
      {posts.length === 0 ? (
        <p className="live-card p-8 text-muted-foreground">{t("news.empty")}</p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/${locale}/news/${post.slug}`} className="group block h-full">
                <article className="live-card flex h-full flex-col overflow-hidden transition-colors group-hover:border-fg">
                  {post.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
                    <img src={post.coverUrl} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <p className="eyebrow text-accent">{post.org === "keda" ? t("news.keda") : t("news.ksc")}</p>
                    <h2 className="mt-3 text-xl font-bold leading-snug">{post.title}</h2>
                    {post.excerpt && <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{post.excerpt}</p>}
                    {post.publishedAt && <p className="mt-5 text-sm text-muted-foreground">{formatDate(post.publishedAt, locale)}</p>}
                  </div>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
