"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the server-rendered match data on the page current without sockets:
 * re-requests the page's data every few seconds while a match is live, and
 * once a minute otherwise so a match that has just started shows up unprompted.
 * It stops while the tab is in the background.
 */
export function LiveRefresh({ live }: { live: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, live ? 10_000 : 60_000);
    return () => clearInterval(timer);
  }, [live, router]);
  return null;
}
