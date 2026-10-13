import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";

// The parent page works in the browser, so its two namespaces are sent to it.
export default async function ParentsLayout({ children, params }: LayoutProps<"/[locale]/parents">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={{ Parents: messages.Parents, ResultsPage: messages.ResultsPage }}>
      {children}
    </NextIntlClientProvider>
  );
}
