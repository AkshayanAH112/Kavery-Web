import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";

/**
 * The match pages are client components that poll for scores and translate as
 * they render, so — unlike the rest of the site — they need messages in the
 * browser. Only the "Live" namespace is sent, not the whole catalogue.
 */
export default async function LiveLayout({ children, params }: LayoutProps<"/[locale]/live">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={{ Live: messages.Live }}>
      {children}
    </NextIntlClientProvider>
  );
}
