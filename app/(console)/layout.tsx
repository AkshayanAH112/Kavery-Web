import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/app/fonts";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";
import { RouteProgress } from "@/components/RouteProgress";
import { SITE_ICONS } from "@/lib/site-icons";
import "@/app/globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Console — Kavery Sports Club", template: "%s — Kavery console" },
  robots: { index: false, follow: false },
  icons: SITE_ICONS,
};

export const viewport: Viewport = { themeColor: "#111113" };

// Applies the saved theme before the first paint, so a dark-mode user never sees
// a white flash. Must match the key used by darkFlag in components/console/Shell.tsx.
const themeScript = `try{if(localStorage.getItem("kavery.console.dark")==="1")document.documentElement.dataset.theme="dark"}catch(e){}`;

// The console is English-only and is never given a locale prefix.
export default function ConsoleRootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script above may set data-theme before React hydrates.
    <html lang="en" className={`${fontVariables} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="theme-console min-h-screen">
        {children}
        {/* Reads the address bar, so it sits in its own boundary and never holds a page back. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}
