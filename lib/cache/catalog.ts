import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Catalogue cache invalidation — ONE list of the surfaces a product, category or
 * branch change can reach, so no mutation can forget half of them.
 *
 * What is actually being invalidated here: this app has no ISR, no `fetch`
 * caching and no `unstable_cache`; every catalogue page is dynamic (`ƒ`) and
 * re-queries the database per request. The cache that does exist is Next's
 * CLIENT-SIDE Router Cache, which serves a previously visited route's payload on
 * soft navigation. Without these calls an admin could save an edit and then
 * navigate back to a page that renders the pre-edit payload — the change is in
 * the database and a hard reload shows it, but an in-app navigation does not.
 *
 * Deliberately targeted: no `revalidatePath("/", "layout")` blanket sweep, no
 * global `no-store`, no timeouts, and no manual refresh button. Each path below
 * is a surface that genuinely renders product data.
 */

/**
 * WHY THE BRANCH CATALOGUE IS NOT PUT IN A TAGGED DATA CACHE.
 *
 * A per-branch `unstable_cache` entry tagged `branch-catalog-<id>` was built and
 * then removed on purpose. In Next 16 `revalidateTag(tag, profile)` invalidates
 * with STALE-WHILE-REVALIDATE semantics: stale content keeps being served while
 * the fresh copy is generated. `updateTag`, which expires immediately, is
 * restricted to Server Actions — and every catalogue mutation here lives in a
 * Route Handler (`app/api/products/**`, `app/api/branches/**`).
 *
 * For a product catalogue that window is not acceptable: the stale entry is
 * exactly the one that still contains the product an admin just held, deactivated
 * or deleted, and a customer served it could add it to their cart. Correctness
 * outweighs the cache hit here — the query is a single indexed `findMany`, and
 * the storefront is a dynamic route that already runs per request.
 *
 * So the catalogue is resolved PER REQUEST, which is also the first of the safe
 * isolation approaches: customer→branch resolution is never cached (it is private
 * coordinate data), and no customer identifier, address id or coordinate has ever
 * appeared in a cache key or URL. Cross-customer leakage is impossible because
 * there is no shared entry to leak.
 */

/** Public storefront + customer ordering flow. */
const CUSTOMER_SURFACES = [
  "/", // homepage: menu sections, product cards, nav search index
  "/customer/branches", // branch list (eligibility depends on the catalogue)
  "/customer/cart",
  "/customer/checkout",
];

/** Staff surfaces that list or price products. */
const STAFF_SURFACES = [
  "/admin/products",
  "/admin/products/deactivated",
  "/admin/categories",
  "/admin/dashboard",
  "/branch-manager/catalog",
  "/branch-manager/dashboard",
  "/marketing/products",
  "/management/reports/products",
];

/**
 * Invalidate every surface that renders catalogue data.
 *
 * `productId` / `branchId` additionally refresh the per-record pages, which are
 * dynamic routes and so are not covered by their list path.
 */
export function revalidateCatalog(opts: { productId?: number; branchId?: number } = {}): void {
  for (const path of CUSTOMER_SURFACES) revalidatePath(path);
  for (const path of STAFF_SURFACES) revalidatePath(path);

  if (opts.productId != null) {
    revalidatePath(`/admin/products/${opts.productId}`);
    revalidatePath(`/admin/products/${opts.productId}/edit`);
    revalidatePath(`/branch-manager/catalog/products/${opts.productId}`);
    revalidatePath(`/branch-manager/catalog/products/${opts.productId}/edit`);
  }
  if (opts.branchId != null) {
    // The branch menu a customer actually orders from.
    revalidatePath(`/customer/branches/${opts.branchId}/menu`);
  }
}

