"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * What a visitor sees between following a link and the next page arriving: a
 * thin bar across the top at once, and — if the page takes longer than a moment
 * — a waiting screen with the crest over the page they are leaving.
 *
 * This is done here, in the browser, rather than with Next's `loading.tsx`
 * files on purpose: those make every page under them answer "200 OK" before it
 * knows whether it exists, so a missing post stops being a real 404 and a
 * redirect stops being a real redirect.
 *
 * It remembers which page the link was followed FROM and shows while that is
 * still the current page — so it disappears by itself when the route changes,
 * with no effect needed to switch it off. A full page load replaces the document
 * (and the bar with it). The timer is only a failsafe for a link that turned out
 * not to navigate.
 */
export function RouteProgress() {
  const here = `${usePathname()}?${useSearchParams()}`;
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Another site, a mail or phone link, or only a jump within this page: nothing will load.
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      // A file (an export, a photo, a payment slip) downloads or opens without leaving this page.
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
      setLeaving(here);
      clearTimeout(timer);
      timer = setTimeout(() => setLeaving(null), 6000);
    };
    // Coming back with the browser's Back button can restore this page exactly as it was left.
    const onShow = () => setLeaving(null);
    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onShow);
    };
  }, [here]);

  if (leaving !== here) return null;
  return (
    <>
      <div role="progressbar" aria-label="Loading the next page" className="route-progress">
        <span />
      </div>
      {/* Fades in after a short delay (CSS), so a fast page never flashes it. */}
      <div aria-hidden className="route-wait">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static crest; it must not wait on the image optimiser */}
        <img src="/brand/ksc-crest.webp" alt="" className="loading-crest h-auto w-28" />
        <div className="loading-bar">
          <span />
        </div>
      </div>
    </>
  );
}
