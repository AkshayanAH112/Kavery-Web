import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";

// The join and renew forms translate in the browser, so this one namespace is sent to it.
export default async function MembershipLayout({ children, params }: LayoutProps<"/[locale]/membership">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={{ Membership: messages.Membership }}>
      {children}
    </NextIntlClientProvider>
  );
}
