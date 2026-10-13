"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * News and gallery console screens, loaded in the browser only — the rich-text
 * editor in particular must stay out of the Worker bundle. Pages import from
 * here, never from the screen files (see components/keda/screens.tsx).
 */
const loading = () => (
  <div className="flex justify-center p-12">
    <Loader2 className="animate-spin text-muted-foreground" size={32} aria-label="Loading" />
  </div>
);

export const NewsScreen = dynamic(() => import("./news"), { ssr: false, loading });
export const NewsNewScreen = dynamic(() => import("./news-new"), { ssr: false, loading });
export const NewsEditScreen = dynamic(() => import("./news-edit"), { ssr: false, loading });
export const GalleryScreen = dynamic(() => import("./gallery"), { ssr: false, loading });
export const GalleryAlbumScreen = dynamic(() => import("./gallery-album"), { ssr: false, loading });
