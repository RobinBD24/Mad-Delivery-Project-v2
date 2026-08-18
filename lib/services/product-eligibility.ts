import "server-only";
import type { Prisma } from "@prisma/client";

import { PRODUCT_BRANDS, PRODUCT_VARIATION_TYPES } from "@/lib/constants/enums";

/**
 * THE single definition of "a customer may see and order this product".
 *
 * Before this module the same question was answered in three different places
 * with three different rule sets — `productsForUser` (catalog lists),
 * `orderableProductWhere` (order creation) and the homepage, which answered it
 * with a hardcoded array and so never consulted the database at all. Divergent
 * rules mean a product can be listed but not orderable, or orderable but not
 * listed. Every public surface now composes the clauses below, so the rules can
 * only ever change in one place.
 *
 * Public surfaces may still choose their own ORDERING and SECTION GROUPING —
 * what they may not do is invent their own definition of "eligible".
 */

// ── The individual rules, each isolated so a caller can never half-apply them ──

/** Never surfaced anywhere: soft-deleted by a super admin (req #4). */
const NOT_DELETED = { deletedAt: null } satisfies Prisma.ProductWhereInput;

/** Sellable right now: branch-manager availability AND no super-admin hold. */
const SELLABLE = { isAvailable: true, heldByAdmin: false } satisfies Prisma.ProductWhereInput;

/** The owning branch must itself be a live customer choice (req #5). */
const LIVE_BRANCH = {
  branch: { isActive: true, isArchived: false },
} satisfies Prisma.ProductWhereInput;

/**
 * At least one ENABLED variation, so there is genuinely something to buy. A
 * product whose every size is disabled is priced but unpurchasable.
 */
const HAS_ENABLED_VARIATION = {
  variations: { some: { isEnabled: true } },
} satisfies Prisma.ProductWhereInput;

/**
 * The crust policy must be one the order pipeline can resolve. A row carrying a
 * value outside the enum (hand-edited data, a reverted migration) would reach
 * `resolveCrustChoice` and reject the order at the very last step; refusing to
 * list it is the honest outcome.
 */
const VALID_VARIATION_TYPE = {
  variationType: { in: [...PRODUCT_VARIATION_TYPES] },
} satisfies Prisma.ProductWhereInput;

/**
 * Brand compatibility. A "combined" branch sells either brand; a single-brand
 * branch may only sell its own. A null product brand inherits the branch, so it
 * is always compatible.
 *
 * Written as an explicit enumeration because Prisma cannot compare two columns
 * (`product.brand = branch.brandType`) inside a `where`. The brand set is a
 * closed two-value enum, so enumerating it is exact rather than approximate.
 */
const BRAND_MATCHES_BRANCH = {
  OR: [
    { brand: null },
    { branch: { brandType: "combined" } },
    ...PRODUCT_BRANDS.map((b) => ({ brand: b, branch: { brandType: b } })),
  ],
} satisfies Prisma.ProductWhereInput;

/**
 * Category rules. A product may have no category at all (allowed — the schema
 * makes `categoryId` optional). When it has one, that category must be ACTIVE
 * and in scope for the product's branch: global (branchId null) or the branch's
 * own.
 *
 * The branch-scoped half is only exactly expressible when the caller already
 * knows the branch id. Without one, Prisma would again need a column-to-column
 * comparison, so the unscoped form additionally accepts a category belonging to
 * some other LIVE branch. That residue is closed on two sides: writes go through
 * `assertCategoryUsableInBranch`, which makes a cross-branch category impossible
 * to store in the first place, and `productCategoryScopeOk()` below re-checks it
 * exactly on the loaded row before anything is ordered.
 */
function categoryScope(branchId?: number): Prisma.ProductWhereInput {
  if (branchId != null) {
    return {
      OR: [
        { categoryId: null },
        { category: { isActive: true, OR: [{ branchId }, { branchId: null }] } },
      ],
    };
  }
  return {
    OR: [
      { categoryId: null },
      { category: { isActive: true, branchId: null } },
      { category: { isActive: true, branch: { isActive: true, isArchived: false } } },
    ],
  };
}

export interface CustomerProductFilters {
  /** Restrict to one branch — also makes the category-scope rule exact. */
  branchId?: number;
  /** "cheez" | "madchef" — a product brand, not a branch brandType. */
  brand?: string | null;
  categoryId?: number | null;
  /** Free-text over name + description. */
  search?: string | null;
  /** Explicit id set (cart / order revalidation). */
  ids?: number[];
}

/**
 * The customer-facing `where`. Every public surface — homepage, menu, search,
 * product detail, cart, quote, checkout, order creation — builds on this.
 */
export function customerProductWhere(
  filters: CustomerProductFilters = {},
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [
    NOT_DELETED,
    SELLABLE,
    LIVE_BRANCH,
    HAS_ENABLED_VARIATION,
    VALID_VARIATION_TYPE,
    BRAND_MATCHES_BRANCH,
    categoryScope(filters.branchId),
  ];

  if (filters.ids) and.push({ id: { in: filters.ids } });
  if (filters.branchId != null) and.push({ branchId: filters.branchId });
  if (filters.brand) and.push({ brand: filters.brand });
  if (filters.categoryId != null) and.push({ categoryId: filters.categoryId });

  // Trimmed and length-capped, matching the convention in lib/selectors.
  const term = (filters.search ?? "").trim().slice(0, 80);
  if (term) {
    and.push({ OR: [{ name: { contains: term } }, { description: { contains: term } }] });
  }

  return { AND: and };
}

/** Relations every public product surface needs to render or price a product. */
export const CUSTOMER_PRODUCT_INCLUDE = {
  branch: true,
  category: true,
  variations: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ProductInclude;

export type CustomerProduct = Prisma.ProductGetPayload<{
  include: typeof CUSTOMER_PRODUCT_INCLUDE;
}>;

/**
 * The one rule `customerProductWhere` cannot express without a branch id:
 * a branch-scoped category must belong to the product's OWN branch. Checked on
 * the loaded row, so unscoped listings and direct-id lookups are held to the
 * same standard as branch-scoped ones.
 */
export function productCategoryScopeOk(product: {
  branchId: number;
  category: { branchId: number | null } | null;
}): boolean {
  const cat = product.category;
  if (!cat) return true;
  return cat.branchId === null || cat.branchId === product.branchId;
}

/**
 * Full eligibility re-checked on an already-loaded row. `customerProductWhere`
 * is the query-time gate; this is the object-time gate, and the two agree by
 * construction. Used where a row arrives by id rather than by listing (product
 * detail, cart revalidation, order creation), so a direct URL or a forged API
 * body is judged by exactly the rules the listings use.
 */
export function isProductOrderable(product: CustomerProduct): boolean {
  if (product.deletedAt !== null) return false;
  if (!product.isAvailable || product.heldByAdmin) return false;
  if (!product.branch.isActive || product.branch.isArchived) return false;
  if (!product.variations.some((v) => v.isEnabled)) return false;
  if (!(PRODUCT_VARIATION_TYPES as readonly string[]).includes(product.variationType)) return false;
  if (product.category && !product.category.isActive) return false;
  if (!productCategoryScopeOk(product)) return false;

  const brandType = product.branch.brandType;
  if (product.brand && brandType !== "combined" && product.brand !== brandType) return false;

  return true;
}
