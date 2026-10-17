import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { fontVariables } from "@/app/fonts";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { RouteProgress } from "@/components/RouteProgress";
import { OpeningCountdown } from "@/components/site/OpeningCountdown";
import { SiteNav } from "@/components/site/SiteNav";
import { isLocale } from "@/i18n/config";
import { getSession } from "@/lib/auth/session";
import { TIME_ZONE } from "@/lib/dates";
import { CLUB, getOpening, getSettings } from "@/lib/site";
import { SITE_ICONS } from "@/lib/site-icons";
import "@/app/globals.css";

// Everything on the public site is read from the database per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0b0909", colorScheme: "dark" };

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const isTa = locale === "ta";

  const title = t("title");
  const description = t("description");
  const clubName = isTa ? "காவேரி விளையாட்டுக் கழகம்" : CLUB.name;
  const siteName = isTa ? "காவேரி விளையாட்டுக் கழகம் — பெரியநீலாவணை" : "Kavery Sports Club — Periyaneelavanai";
  const ogImage = isTa ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";

  return {
    metadataBase: new URL("https://periyaneelavanaikaverysports.club"),
    title,
    description,
    applicationName: clubName,
    keywords: [
      "Kavery Sports Club",
      "Periyaneelavanai",
      "KSC",
      "KEDA",
      "Kavery Education Development Association",
      "Periyaneelavanai sports",
      "Batticaloa cricket",
      "Ampara cricket",
      "Eastern Province cricket",
      "Sri Lanka club cricket",
      "காவேரி விளையாட்டுக் கழகம்",
      "பெரியநீலாவணை",
      "காவேரி கல்விசார் அபிவிருத்தி ஒன்றியம்",
      "கல்வி இலவச வகுப்புகள்",
      "கிரிக்கெட் போட்டி முடிவுகள்",
    ],
    authors: [{ name: CLUB.name, url: "https://periyaneelavanaikaverysports.club" }],
    creator: CLUB.name,
    publisher: CLUB.name,
    formatDetection: { telephone: true, date: true, address: true, email: true },
    appleWebApp: { capable: true, title: "Kavery", statusBarStyle: "black-translucent" },
    icons: SITE_ICONS,
    verification: {
      google: "googlea735d44a786fccc9",
    },
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ta: "/ta", "x-default": "/en" },
    },
    openGraph: {
      type: "website",
      locale: isTa ? "ta_LK" : "en_US",
      alternateLocale: [isTa ? "en_US" : "ta_LK"],
      url: `/${locale}`,
      siteName,
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: siteName,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, settings] = await Promise.all([getTranslations(), getSettings()]);
  // Before the opening every public page is the countdown; signed-in staff see the site to check it.
  const opening = getOpening();
  const gated = opening !== null && !(await getSession());
  const isTa = locale === "ta";
  const base = `/${locale}`;
  const other = locale === "en" ? "ta" : "en";
  const links = [
    { href: `${base}#matches`, label: t("nav.matches") },
    { href: `${base}/about`, label: t("nav.about") },
    { href: `${base}#education`, label: t("nav.education") },
    // Always offered, even before the first post or album: the club asked for them to be findable.
    { href: `${base}/news`, label: t("nav.news") },
    { href: `${base}/gallery`, label: t("nav.gallery") },
    { href: `${base}/membership`, label: t("nav.join") },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsClub",
        "@id": "https://periyaneelavanaikaverysports.club/#club",
        name: "Kavery Sports Club",
        // The usual other spellings of காவேரி, so a search for any of them can match the club.
        alternateName: ["காவேரி விளையாட்டுக் கழகம்", "KSC", "Kavery SC", "Periyaneelavanai Kavery Sports Club", "Kavery Sports Club Periyaneelavanai", "Kaveri Sports Club", "Cauvery Sports Club"],
        url: "https://periyaneelavanaikaverysports.club",
        logo: "https://periyaneelavanaikaverysports.club/brand/ksc-crest.png",
        image: "https://periyaneelavanaikaverysports.club/brand/og-image-en.png",
        foundingDate: "1981",
        sport: "Cricket",
        address: {
          "@type": "PostalAddress",
          streetAddress: settings.address || "Periyaneelavanai",
          addressLocality: "Periyaneelavanai",
          addressRegion: "Eastern Province",
          addressCountry: "LK",
        },
        ...(settings.contactPhone ? { telephone: settings.contactPhone } : {}),
        ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
        description: isTa
          ? "பெரியநீலாவணையில் 1981 முதல் இயங்கிவரும் காவேரி விளையாட்டுக் கழகம். கிரிக்கெட், விளையாட்டு நிகழ்வுகள் மற்றும் கிராம சமூக மேம்பாட்டுப் பணிகள்."
          : "Kavery Sports Club in Periyaneelavanai, Sri Lanka, established in 1981. Cricket club, live match centre, and community sports.",
      },
      {
        "@type": "EducationalOrganization",
        "@id": "https://periyaneelavanaikaverysports.club/#keda",
        name: "Kavery Education Development Association",
        alternateName: ["காவேரி கல்விசார் அபிவிருத்தி ஒன்றியம்", "KEDA"],
        parentOrganization: { "@id": "https://periyaneelavanaikaverysports.club/#club" },
        url: "https://periyaneelavanaikaverysports.club",
        logo: "https://periyaneelavanaikaverysports.club/brand/keda-logo.webp",
        foundingDate: "2023",
        description: isTa
          ? "பெரியநீலாவணைக் கிராம மாணவர்களுக்கான இலவசக் கல்வி வகுப்புகள், பரீட்சை வழிகாட்டல்கள் மற்றும் கல்விசார் அபிவிருத்தி திட்டங்கள்."
          : "Free community education, revision classes, and academic development for students in Periyaneelavanai.",
      },
      {
        "@type": "WebSite",
        "@id": "https://periyaneelavanaikaverysports.club/#website",
        url: "https://periyaneelavanaikaverysports.club",
        name: isTa ? "காவேரி விளையாட்டுக் கழகம்" : "Kavery Sports Club",
        publisher: { "@id": "https://periyaneelavanaikaverysports.club/#club" },
        inLanguage: ["en", "ta"],
      },
    ],
  };

  return (
    <html lang={locale} className={`${fontVariables} antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="theme-night min-h-screen">
        {/* No NextIntlClientProvider: client components get their strings as props, so the
            message catalogue is never shipped to the browser. */}
        {gated ? (
          <OpeningCountdown
            at={opening.at}
            now={opening.now}
            home={base}
            founded={CLUB.founded}
            language={{ href: `/${other}`, label: t("nav.language"), lang: other }}
            labels={{
              eyebrow: t("opening.eyebrow"),
              line1: t("hero.line1"),
              line2: t("hero.line2"),
              lead: t("opening.lead"),
              when: t("opening.when", {
                date: new Intl.DateTimeFormat(isTa ? "ta-LK" : "en-GB", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(opening.at),
                time: new Intl.DateTimeFormat(isTa ? "ta-LK" : "en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(opening.at),
              }),
              days: t("opening.days"),
              hours: t("opening.hours"),
              minutes: t("opening.minutes"),
              seconds: t("opening.seconds"),
              open: t("opening.open"),
              entering: t("opening.entering"),
              staff: t("footer.staff"),
            }}
          />
        ) : (
          <>
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
                    <Image src="/brand/ksc-crest.png" alt="Kavery Sports Club crest" width={72} height={72} className="h-18 w-18" />
                    <Image src="/brand/keda-logo.webp" alt="Kavery Education Development Association (KEDA) logo" width={64} height={67} className="h-16 w-auto rounded-md bg-white p-1" />
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
          </>
        )}
        {/* Reads the address bar, so it sits in its own boundary and never holds a page back. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}
