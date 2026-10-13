import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Uploads are resized in the browser before they reach R2, so what is stored is
  // what is served. Next's optimizer would need the paid Cloudflare Images binding
  // only to re-compress files that are already the right size.
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);

// Makes the D1/R2 bindings from wrangler.jsonc available to `next dev`.
initOpenNextCloudflareForDev();
