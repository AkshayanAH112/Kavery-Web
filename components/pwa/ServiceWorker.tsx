"use client";

import { useEffect } from "react";

/** Registers public/sw.js — the piece that receives pushes and shows the offline page. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
