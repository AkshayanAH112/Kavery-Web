import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { fontVariables } from "@/app/fonts";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { SiteNav } from "@/components/site/SiteNav";
import { isLocale } from "@/i18n/config";
import { getContentPresence } from "@/lib/content/public";
import { CLUB, getSettings } from "@/lib/site";
import "@/app/globals.css";

// Everything on the public site is read from the database per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0b0909", colorScheme: "dark" };

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    appleWebApp: { capable: true, title: "Kavery", statusBarStyle: "black-translucent" },
    icons: { apple: "/icons/apple-touch-icon.png" },
    alternates: { languages: { en: "/en", ta: "/ta", "x-default": "/en" } },
  };
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, settings, has] = await Promise.all([getTranslations(), getSettings(), getContentPresence()]);
  const base = `/${locale}`;
  const other = locale === "en" ? "ta" : "en";
  const links = [
    { href: `${base}#matches`, label: t("nav.matches") },
    { href: `${base}/about`, label: t("nav.about") },
    { href: `${base}#education`, label: t("nav.education") },
    ...(has.news ? [{ href: `${base}/news`, label: t("nav.news") }] : []),
    ...(has.gallery ? [{ href: `${base}/gallery`, label: t("nav.gallery") }] : []),
    { href: `${base}/membership`, label: t("nav.join") },
  ];

  return (
    <html lang={locale} className={`${fontVariables} antialiased`}>
      <body className="theme-night min-h-screen">
        {/* No NextIntlClientProvider: client components get their strings as props, so the
            message catalogue is never shipped to the browser. */}
          <SiteNav
            home={base}
            links={links}
            app={{ href: `${base}#app`, label: t("nav.app") }}
            language={{ href: `/${other}`, label: t("nav.language"), ariaLabel: t("nav.languageLabel"), lang: other }}
            labels={{ menu: t("nav.menu"), close: t("nav.close"), brand: CLUB.shortName }}
          />
          <main>{children}</main>

          <footer className="border-t border-line bg-surface">
            <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-4">
                  <Image src="/brand/ksc-crest.png" alt="" width={72} height={72} className="h-18 w-18" />
                  <Image src="/brand/keda-logo.webp" alt="" width={64} height={67} className="h-16 w-auto rounded-md bg-white p-1" />
                </div>
                <p className="mt-6 max-w-sm leading-relaxed text-muted-foreground">{t("footer.tagline")}</p>
              </div>
              <div>
                <h2 className="eyebrow text-accent">{t("footer.explore")}</h2>
                <ul className="mt-5 space-y-1">
                  {links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className="inline-flex min-h-11 items-center text-muted-foreground hover:text-fg">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="eyebrow text-accent">{t("footer.contact")}</h2>
                <ul className="mt-5 space-y-1 text-muted-foreground">
                  <li className="py-2.5">{settings.address}</li>
                  {settings.contactEmail && (
                    <li>
                      <a href={`mailto:${settings.contactEmail}`} className="inline-flex min-h-11 items-center break-all hover:text-fg">
                        {settings.contactEmail}
                      </a>
                    </li>
                  )}
                  {settings.contactPhone && (
                    <li>
                      <a href={`tel:${settings.contactPhone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center hover:text-fg">
                        {settings.contactPhone}
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>
            <div className="border-t border-line">
              <div className="container-x flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-5 text-sm text-muted-foreground">
                <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
                {/* The console is not localised — this must never get a locale prefix. */}
                <Link href="/login" className="inline-flex min-h-11 items-center hover:text-fg">
                  {t("footer.staff")}
                </Link>
              </div>
            </div>
          </footer>
        <ServiceWorker />
      </body>
    </html>
  );
}
