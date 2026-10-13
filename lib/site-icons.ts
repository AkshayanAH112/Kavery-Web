import type { Metadata } from "next";

/** The tab and home-screen icons, shared by the public site and the console. */
export const SITE_ICONS: Metadata["icons"] = {
  // Declared in full: with only `apple` given, no tab icon was announced at all and browsers showed a blank globe.
  icon: [
    { url: "/favicon.ico", sizes: "48x48" },
    { url: "/icon.png", type: "image/png", sizes: "48x48" },
    { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
  ],
  shortcut: "/favicon.ico",
  apple: "/icons/apple-touch-icon.png",
};
