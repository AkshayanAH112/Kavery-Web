import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JoinForm } from "@/components/site/MembershipForms";
import { PageShell } from "@/components/site/PageShell";
import { getMembershipSettings } from "@/lib/membership/server";
import { getSettings } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/membership">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Membership" });
  return { title: t("meta_title"), description: t("meta_description"), alternates: { languages: { en: "/en/membership", ta: "/ta/membership", "x-default": "/en/membership" } } };
}

export default async function JoinPage({ params }: PageProps<"/[locale]/membership">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, membership, site] = await Promise.all([getTranslations("Membership"), getMembershipSettings(), getSettings()]);

  return (
    <PageShell narrow crumbs={[{ label: t("home"), href: `/${locale}` }, { label: t("membership") }]} eyebrow={t("eyebrow")} title={t("title")} lead={membership.open ? t("lead") : undefined}>
      {membership.open ? (
        <>
          {/* Only what the form shows is sent to the browser: the fee table and bank details when there is a fee, nothing otherwise. */}
          <JoinForm fee={membership.feeEnabled ? { currency: membership.currency, fees: membership.fees, bank: membership.bank } : null} />
          <p className="mt-8 text-muted-foreground">
            {t("have_membership")}{" "}
            <Link href={`/${locale}/membership/renew`} className="font-semibold text-accent underline-offset-4 hover:underline">
              {t("renew_link")}
            </Link>
          </p>
        </>
      ) : (
        <div className="live-card p-8">
          <h2 className="display text-3xl">{t("closed_title")}</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{t("closed_body")}</p>
          {site.contactEmail && (
            <a href={`mailto:${site.contactEmail}`} className="mt-5 inline-flex min-h-11 items-center break-all font-semibold text-accent underline-offset-4 hover:underline">
              {site.contactEmail}
            </a>
          )}
        </div>
      )}
    </PageShell>
  );
}
