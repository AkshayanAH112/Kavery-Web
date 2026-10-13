import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RenewForm } from "@/components/site/MembershipForms";
import { PageShell } from "@/components/site/PageShell";
import { getMembershipSettings } from "@/lib/membership/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/membership/renew">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Membership" });
  const title = t("renew_meta_title");
  const description = t("meta_description");
  const ogImage = locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/membership/renew`,
      languages: { en: "/en/membership/renew", ta: "/ta/membership/renew", "x-default": "/en/membership/renew" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/membership/renew`,
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

export default async function RenewPage({ params }: PageProps<"/[locale]/membership/renew">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, membership] = await Promise.all([getTranslations("Membership"), getMembershipSettings()]);

  return (
    <PageShell
      narrow
      crumbs={[{ label: t("home"), href: `/${locale}` }, { label: t("membership"), href: `/${locale}/membership` }, { label: t("renew_crumb") }]}
      eyebrow={t("eyebrow")}
      title={t("renew_title")}
      lead={membership.open ? t("renew_lead") : undefined}
    >
      {membership.open ? (
        <RenewForm fee={membership.feeEnabled ? { currency: membership.currency, fees: membership.fees, bank: membership.bank } : null} />
      ) : (
        <div className="live-card p-8">
          <h2 className="display text-3xl">{t("closed_title")}</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{t("closed_body")}</p>
        </div>
      )}
      <p className="mt-8 text-muted-foreground">
        {t("not_member")}{" "}
        <Link href={`/${locale}/membership`} className="font-semibold text-accent underline-offset-4 hover:underline">
          {t("join_link")}
        </Link>
      </p>
    </PageShell>
  );
}
