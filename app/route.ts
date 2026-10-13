import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * "/" has no page: it sends the visitor to their language. This does the job
 * locale middleware would do elsewhere — the Cloudflare adapter does not run
 * Next's Node-runtime proxy, so locale routing lives in the [locale] segment.
 */
export async function GET() {
  const saved = (await cookies()).get("NEXT_LOCALE")?.value;
  if (isLocale(saved)) redirect(`/${saved}`);
  const accepts = (await headers()).get("accept-language") ?? "";
  redirect(/^\s*ta\b/i.test(accepts) ? "/ta" : `/${defaultLocale}`);
}
