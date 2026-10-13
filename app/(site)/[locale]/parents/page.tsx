import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageShell } from "@/components/site/PageShell";
import ParentPortal from "@/components/site/ParentPortal";

export async function generateMetadata({ params }: PageProps<"/[locale]/parents">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Parents" });
  return {
    title: t("meta_title"),
    description: t("meta_description"),
    // What a parent sees here is one child's record; there is nothing for a search engine.
    robots: { index: false, follow: true },
    alternates: { languages: { en: "/en/parents", ta: "/ta/parents", "x-default": "/en/parents" } },
  };
}

export default async function ParentsPage({ params }: PageProps<"/[locale]/parents">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Parents");
  return (
    <PageShell crumbs={[{ label: t("home"), href: `/${locale}` }, { label: t("parents") }]} eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")}>
      <ParentPortal />
    </PageShell>
  );
}
