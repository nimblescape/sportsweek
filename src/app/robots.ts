import type { MetadataRoute } from "next";

// This app is an authenticated internal tool — keep it out of search engines entirely.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
