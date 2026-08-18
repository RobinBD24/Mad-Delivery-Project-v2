import "server-only";

import { PRODUCT_BRANDS } from "@/lib/constants/enums";
import { prisma } from "@/lib/db";
import type { Brand, MenuItem, PublicCategory, SearchEntry, SizeOption } from "@/lib/home/types";
import {
  CUSTOMER_PRODUCT_INCLUDE,
  customerProductWhere,
  productCategoryScopeOk,
  type CustomerProduct,
} from "@/lib/services/product-eligibility";
import { mediaUrl } from "@/lib/utils";

/**
 * The PUBLIC storefront catalogue, read from the database.
 *
 * The homepage used to render `MENU_ITEMS` — 107 products hardcoded in
 * `lib/home/menu-data.ts` whose names appeared nowhere in the database. Nothing
 * a customer saw could be edited, priced, held or removed from the admin panel,
 * because the two systems shared no rows at all. This module replaces that
 * array with the real catalogue, mapped into the SAME `MenuItem` shape the
 * existing cards and modals already render, so the visual design is untouched.
 *
 * Eligibility is not decided here — it comes from `customerProductWhere`, the
 * one definition every public surface shares.
 */

/**
 * Category emoji. Categories are free-text rows created by admins, so there is
 * no fixed key set to map from; matching on a keyword keeps the familiar icons
 * for the usual names and degrades to a neutral plate for anything new. Purely
 * decorative — it never affects which products are shown.
 */
const EMOJI_KEYWORDS: [RegExp, string][] = [
  [/pizza/i, "🍕"],
  [/pasta|spaghetti|penne/i, "🍝"],
  [/boat/i, "⛵"],
  [/appetiz|starter/i, "🥗"],
  [/soup/i, "🍲"],
  [/carbonat|can\b|soda/i, "🥫"],
  [/drink|beverage|juice|shake|coffee|tea/i, "🥤"],
  [/burger/i, "🍔"],
  [/wrap|roll/i, "🌯"],
  [/poutine/i, "🍟"],
  [/rice|meal|biryani|khichuri/i, "🍚"],
  [/teaser|steak|platter/i, "🥩"],
  [/fries/i, "🍟"],
  [/wing/i, "🍗"],
  [/dessert|sweet|cake|ice/i, "🍮"],
  [/sandwich/i, "🥪"],
  [/chicken/i, "🍗"],
];

export function categoryEmoji(name: string): string {
  for (const [re, emoji] of EMOJI_KEYWORDS) if (re.test(name)) return emoji;
  return "🍽️";
}

/** Stable, URL-safe category key. Ids are stable across renames; names are not. */
const UNCATEGORIZED = "uncategorized";
export function categoryKeyFor(categoryId: number | null): string {
  return categoryId == null ? UNCATEGORIZED : String(categoryId);
}

/**
 * The brand a product is sold under. `Product.brand` is written explicitly by
 * `resolveProductBrand` on every create, but legacy rows may still be null, in
 * which case the branch's sole brand applies. A null brand on a "combined"
 * branch is genuinely indeterminate — such a product is listed under BOTH brand
 * tabs rather than silently vanishing from the storefront.
 */
function brandsOf(product: CustomerProduct): Brand[] {
  const explicit = product.brand;
  if (explicit && (PRODUCT_BRANDS as readonly string[]).includes(explicit)) {
    return [explicit as Brand];
  }
  const branchBrand = product.branch.brandType;
  if ((PRODUCT_BRANDS as readonly string[]).includes(branchBrand)) return [branchBrand as Brand];
  return [...PRODUCT_BRANDS];
}

/** Percentage discount applied to a price, rounded to 2dp like the order pipeline. */
function discounted(price: unknown, discountPct: unknown): number {
  const base = Number(price);
  const pct = Number(discountPct) || 0;
  if (!Number.isFinite(base)) return 0;
  const value = pct > 0 ? base * (1 - pct / 100) : base;
  return Number(value.toFixed(2));
}

/**
 * Map one database product onto the `MenuItem` the storefront cards render.
 * Every visual field the design uses is derived from a real column, so a change
 * made in the admin panel is the change the customer sees.
 */
function toMenuItem(product: CustomerProduct, brand: Brand, categoryLabel: string): MenuItem {
  const enabled = product.variations.filter((v) => v.isEnabled);
  const prices = enabled.map((v) => discounted(v.price, product.discount));
  const base = prices.length ? Math.min(...prices) : discounted(product.price, product.discount);

  // Sizes drive the "choose a size" modal. One variation is not a choice, so it
  // is priced inline and the card adds straight to the cart — the behaviour the
  // design already had for single-price items.
  const sizes: SizeOption[] | undefined =
    enabled.length > 1
      ? enabled.map((v) => ({
          key: String(v.id),
          label: v.name,
          sub: v.servingInfo || v.sizeLabel || undefined,
          price: discounted(v.price, product.discount),
        }))
      : undefined;

  return {
    id: String(product.id),
    name: product.name,
    description: product.description,
    price: base,
    fromPrice: enabled.length > 1,
    // Versioned by updatedAt so a replaced photo can never render from the
    // browser's cached copy. Stored keys are uuids, so the URL changes anyway;
    // the version also covers legacy rooted paths that were overwritten in place.
    image: mediaUrl(product.image, product.updatedAt.toISOString()) ?? "",
    brand,
    category: categoryKeyFor(product.categoryId),
    group: categoryLabel,
    emoji: categoryEmoji(categoryLabel),
    // Translation KEY, not a display string — the card looks up
    // home.product.badge.<key>, so no raw key or untranslated English leaks.
    badgeKey: product.isPopular ? "popular" : product.isRecommended ? "recommended" : undefined,
    sizes,
    about: product.description || undefined,
    preparationTime: product.preparationTime,
    variationType: product.variationType,
    branchId: product.branchId,
    branchName: product.branch.name,
  };
}

export interface PublicMenu {
  categories: PublicCategory[];
  items: MenuItem[];
  search: SearchEntry[];
}

/**
 * The public storefront menu.
 *
 * `branchId` scopes it to ONE branch — an authenticated customer orders from
 * exactly one nearest eligible branch, so mixing branches would show them
 * products they cannot buy. Omitting it keeps the all-branches showcase used for
 * guests, which is the project's existing public behaviour.
 *
 * Every section (cards, category tabs, nav search) is built from this one query,
 * so no section can be scoped differently from another.
 *
 * Returns empty arrays when nothing qualifies — the page then renders its
 * existing empty state instead of fabricated products or another branch's.
 */
async function buildMenu(branchId?: number): Promise<PublicMenu> {
  const rows = await prisma.product.findMany({
    where: customerProductWhere(branchId != null ? { branchId } : {}),
    include: CUSTOMER_PRODUCT_INCLUDE,
    // Featured first, then the admin-controlled sort, then a stable name order
    // so two renders of the same data never disagree.
    orderBy: [{ isPopular: "desc" }, { isRecommended: "desc" }, { name: "asc" }, { id: "asc" }],
  });

  // The one eligibility rule a Prisma `where` cannot express without a branch
  // id: a branch-scoped category must belong to the product's own branch.
  const products = rows.filter(productCategoryScopeOk);

  const items: MenuItem[] = [];
  const categories: PublicCategory[] = [];
  const seenCategory = new Set<string>();

  for (const product of products) {
    const label = product.category?.name ?? "";
    const key = categoryKeyFor(product.categoryId);
    for (const brand of brandsOf(product)) {
      items.push(toMenuItem(product, brand, label));
      const dedupe = `${brand}:${key}`;
      if (product.categoryId != null && !seenCategory.has(dedupe)) {
        seenCategory.add(dedupe);
        categories.push({ key, label, emoji: categoryEmoji(label), brand });
      }
    }
  }

  // A category tab is only offered when it has products for that brand, so the
  // storefront never shows a tab that leads to an empty grid.
  categories.sort((a, b) => a.label.localeCompare(b.label));

  const search: SearchEntry[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    emoji: categoryEmoji(item.group ?? ""),
    price: item.price,
    fromPrice: Boolean(item.fromPrice),
  }));

  return { categories, items, search };
}

/**
 * CACHE ISOLATION — one customer's catalogue can never reach another.
 *
 * Resolved PER REQUEST, deliberately: see the long note in lib/cache/catalog.ts
 * for why a tagged data cache was built and then removed (Next 16's
 * `revalidateTag` is stale-while-revalidate, and every catalogue mutation here
 * lives in a Route Handler where the immediate `updateTag` is unavailable — so a
 * cached entry could serve a product that was just held or deleted).
 *
 * The guarantee that matters holds regardless: no customer id, address id or
 * coordinate appears in any cache key or URL, the customer→branch resolution is
 * never cached, and there is no shared catalogue entry to leak. Customer A near
 * Banani cannot warm anything that customer B near Dhanmondi would then read.
 */
export function branchMenu(branchId: number): Promise<PublicMenu> {
  return buildMenu(branchId);
}

/** The guest / all-branches showcase. Unchanged public behaviour. */
export function publicMenu(): Promise<PublicMenu> {
  return buildMenu();
}
