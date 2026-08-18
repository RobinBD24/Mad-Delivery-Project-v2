import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo/site";

/**
 * PHASE B — crawl rules.
 *
 * The public storefront is indexable; everything behind a login is not. The
 * disallow list names each authenticated section explicitly rather than relying
 * on a login redirect to hide it, because a crawler that follows a stale link
 * should be told plainly, not bounced.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/management/",
          "/marketing/",
          "/branch-manager/",
          "/accounts/",
          "/rider/",
          "/customer/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
