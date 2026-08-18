"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Reset the scroll position on every authenticated navigation.
 *
 * Next's `<Link>` deliberately MAINTAINS scroll position and only scrolls when
 * the new page is out of view — and then it targets "the top of the first Page
 * element", skipping sticky/fixed elements as it walks the siblings. In this
 * shell that lands part-way down the new page: navigating from a scrolled list
 * left the next page mid-content instead of at its heading.
 *
 * Mounted inside the authenticated layout only, so no public page is affected.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  // Paging and filtering only change the query string, and those navigations
  // are started from controls at the BOTTOM of a list — landing at the top of
  // the new page is the whole point.
  const searchParams = useSearchParams();

  useEffect(() => {
    // An in-page anchor (the skip link, for instance) is asking for a specific
    // element; overriding it would defeat the link.
    if (window.location.hash) return;

    // Next performs its own scroll adjustment when it commits the navigation,
    // which lands AFTER this effect — resetting here alone gets overwritten.
    // Two frames puts this after that commit and after paint, so the reset is
    // the last word. `instant` avoids motion the user did not ask for.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pathname, searchParams]);

  return null;
}
