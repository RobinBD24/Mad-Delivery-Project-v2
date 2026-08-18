import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo/site";

/**
 * PHASE B — sitemap.
 *
 * Only genuinely public, indexable pages appear here. Authenticated dashboards
 * are deliberately absent: listing a page that always redirects to the login
 * form would be a wasted crawl and a duplicate-content trap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
  ];
}
