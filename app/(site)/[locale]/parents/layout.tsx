import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";

// The parent page and the exam page work in the browser, so their namespaces are sent to them.
export default async function ParentsLayout({ children, params }: LayoutProps<"/[locale]/parents">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={{ Parents: messages.Parents, ResultsPage: messages.ResultsPage, Exam: messages.Exam }}>
      {children}
    </NextIntlClientProvider>
  );
}
