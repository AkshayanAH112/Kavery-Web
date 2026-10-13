import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Frame shared by every /live page: breadcrumb and container. The pages
 * themselves are thin — the content is a client component that polls the
 * public cricket API, so nothing below the breadcrumb is rendered on the server.
 *
 * `current` is the last crumb when the page is deeper than /live (a match, a
 * team); omitted on /live itself.
 */
export default async function LivePageShell({ locale, current, children }: { locale: string; current?: string | null; children: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "Live" });
  return (
    <div className="min-h-screen pb-24 pt-[calc(var(--nav-h)+2rem)]">
      <div className="container-x max-w-[64rem]">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Link href={`/${locale}`} className="inline-flex min-h-11 items-center transition-colors hover:text-fg">
            {t("home")}
          </Link>
          <ChevronRight size={14} aria-hidden />
          {current ? (
            <>
              <Link href={`/${locale}/live`} className="inline-flex min-h-11 items-center transition-colors hover:text-fg">
                {t("live")}
              </Link>
              <ChevronRight size={14} aria-hidden />
              <span aria-current="page" className="min-w-0 truncate text-accent">
                {current}
              </span>
            </>
          ) : (
            <span aria-current="page" className="text-accent">
              {t("live")}
            </span>
          )}
        </nav>
        {children}
      </div>
    </div>
  );
}

/** Metadata for a /live page. A null `name` is something not public (or not found): generic title, kept out of the index. */
export async function liveMetadata(locale: string, path: string, name?: string | null): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Live" });
  const title = name ? `${name} | ${t("meta_title")}` : t("meta_title");
  const ogImage = locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";
  const description = t("meta_description");
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { en: `/en${path}`, ta: `/ta${path}`, "x-default": `/en${path}` },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}${path}`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    ...(name === null ? { robots: { index: false, follow: true } } : {}),
  };
}
