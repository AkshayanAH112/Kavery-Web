import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "./config";

// There is no proxy/middleware in this app (the Cloudflare adapter does not run
// Next's Node-runtime proxy), so the locale comes from the [locale] segment via
// setRequestLocale() in the layout and each page, not from a request header.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
