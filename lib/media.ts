import type { Permission } from "@/lib/auth/roles";

/**
 * Where uploads go in R2, who may upload there, and whether the public may read
 * it back through /media. Anything not listed cannot be uploaded or served.
 */
export const MEDIA_FOLDERS: Record<string, { permission: Permission; public: boolean }> = {
  cricket: { permission: "cricket.score", public: true },
  news: { permission: "content.manage", public: true },
  gallery: { permission: "content.manage", public: true },
};

/**
 * Raster images only. SVG is refused on purpose: it can carry script, and these
 * files are served from the site's own origin.
 */
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const mediaUrl = (key: string) => `/media/${key}`;
