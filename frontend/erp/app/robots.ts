import type { MetadataRoute } from "next";

// Internal company tool — never meant to be crawled or indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
