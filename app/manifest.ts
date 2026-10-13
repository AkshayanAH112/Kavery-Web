import type { MetadataRoute } from "next";

// What makes the site installable from the browser ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kavery Sports Club",
    short_name: "Kavery",
    description: "Live scores, club news and KEDA class notices from Kavery Sports Club, Periyaneelavanai.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0909",
    theme_color: "#0b0909",
    lang: "en",
    categories: ["sports", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Match centre", url: "/en#matches" },
      { name: "Staff console", url: "/console" },
    ],
  };
}
