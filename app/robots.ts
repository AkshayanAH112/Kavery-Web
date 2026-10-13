import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/console/", "/login", "/api/"],
      },
    ],
    sitemap: "https://periyaneelavanaikaverysports.club/sitemap.xml",
    host: "https://periyaneelavanaikaverysports.club",
  };
}
