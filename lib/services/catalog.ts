import "server-only";
import { Prisma } from "@prisma/client";
import type { Branch, Product, User } from "@prisma/client";

import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import {
  branchAllowsBrand,
  isProductBrand,
  isProductVariationType,
  PRODUCT_VARIATION_TYPE_DEFAULT,
  soleBrandOfBranch,
} from "@/lib/constants/enums";
import { branchForManager } from "@/lib/selectors";

// ── Branch resolution + permissions ─────────────────────────────────────
/**
 * The branch a user may create/manage catalog entries in.
 * - super_admin: uses the submitted branchId (must exist).
 * - branch_manager: ALWAYS their own assigned branch — a submitted branchId is
 *   ignored, blocking cross-branch spoofing (rule 10 / IDOR).
 * Anyone else is forbidden.
 */
export async function resolveCatalogBranch(user: User, submittedBranchId?: number): Promise<Branch> {
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    return branch;
  }
  if (user.role === "super_admin") {
    if (!submittedBranchId || Number.isNaN(submittedBranchId)) {
      throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
    }
    const branch = await prisma.branch.findUnique({ where: { id: submittedBranchId } });
    if (!branch) throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
    return branch;
  }
  throw forbidden(sk("errors.catalog.onlyAssignedManagerCanModifyCatalog"));
}

/** Load a product the user is allowed to manage, or throw (404/403). IDOR-safe. */
export async function productForManage(user: User, productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound(sk("errors.catalog.productNotFound"));
  if (user.role === "super_admin") return product;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    if (product.branchId !== branch.id) throw forbidden(sk("errors.catalog.productNotYourBranch"));
    return product;
  }
  throw forbidden(sk("errors.catalog.onlyAssignedManagerCanModifyCatalog"));
}

/**
 * Super-admin soft delete (req #4). Only the super admin may delete a product;
 * branch managers and every other role are rejected. Because OrderItem +
 * FoodReview rows reference the product, a hard delete would break historical
 * orders — so we set deletedAt (+ actor) and force isAvailable=false, which
 * hides the product from every catalog list and blocks new orders while all
 * historical rows keep resolving. Idempotent: re-deleting a deleted product is
 * a no-op. The user-facing action still says "Delete".
 */
export async function softDeleteProduct(user: User, productId: number): Promise<Product> {
  if (user.role !== "super_admin") {
    throw forbidden(sk("errors.catalog.onlyAdminCanDeleteProduct"));
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound(sk("errors.catalog.productNotFound"));
  if (product.deletedAt) return product; // already deleted — idempotent
  const deleted = await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), deletedById: user.id, isAvailable: false },
    include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
  });
  // Must disappear from the storefront, menu and search immediately.
  revalidateCatalog({ productId: deleted.id, branchId: deleted.branchId });
  return deleted;
}

/**
 * Resolve + validate the brand a product carries against its branch:
 * - single-brand branch → forced to that brand (submission ignored).
 * - combined branch → an explicit valid brand is required.
 */
export function resolveProductBrand(branch: Branch, submitted?: string | null): string {
  const sole = soleBrandOfBranch(branch.brandType);
  if (sole) return sole;
  const brand = (submitted ?? "").trim();
  if (!brand || !isProductBrand(brand)) {
    throw validationError({ brand: sk("errors.catalog.selectBrand") });
  }
  if (!branchAllowsBrand(branch.brandType, brand)) {
    throw validationError({ brand: sk("errors.catalog.brandNotAllowedForBranch") });
  }
  return brand;
}

// ── Category scoping (req #8) ───────────────────────────────────────────
// A category is either global (branchId === null → "Main Branch (Global)") or
// bound to one branch. The categories a branch may use = its own + all global.

/** Case/space-insensitive normalized form for scoped duplicate detection. */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * A category is usable by a branch's products when it is that branch's own
 * category OR a global (branchId null) category. Cross-branch use is rejected
 * server-side — a branch manager can never attach another branch's category
 * (req #8 / #10). Also rejects an inactive category.
 */
export async function assertCategoryUsableInBranch(categoryId: number, branchId: number) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || (category.branchId !== null && category.branchId !== branchId)) {
    throw validationError({ category: sk("errors.catalog.categoryNotYourBranch") });
  }
  if (!category.isActive) {
    throw validationError({ category: sk("errors.catalog.categoryInactive") });
  }
  return category;
}

// ── Category CRUD — SUPER ADMIN ONLY (req #7) ───────────────────────────
// Every category mutation runs through here so the RBAC + scope + duplicate
// rules live in one place. Branch managers get read-only access (for product
// forms) via the selector; they can never reach these.

/** Resolve the category scope a super admin submitted: a branch id, or global. */
async function resolveCategoryScope(submitted: unknown): Promise<number | null> {
  // "" | "global" | null | undefined → Main Branch (Global).
  if (submitted === undefined || submitted === null || submitted === "" || submitted === "global") {
    return null;
  }
  const branchId = Number(submitted);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
  }
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
  return branch.id;
}

/** Block a duplicate ACTIVE category name inside the same effective scope. */
async function assertUniqueCategoryName(
  normalized: string,
  branchId: number | null,
  excludeId?: number,
) {
  const clash = await prisma.category.findFirst({
    where: {
      normalizedName: normalized,
      branchId,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash) throw validationError({ name: sk("errors.catalog.categoryNameDuplicate") });
}

export async function createCategory(
  user: User,
  input: { name: string; description?: string; isActive?: boolean; branchId?: unknown },
) {
  if (user.role !== "super_admin") throw forbidden(sk("errors.catalog.onlyAdminCanCreateCategory"));
  const name = String(input.name ?? "").trim();
  if (!name) throw validationError({ name: sk("errors.catalog.categoryNameRequired") });
  const branchId = await resolveCategoryScope(input.branchId);
  const normalizedName = normalizeCategoryName(name);
  await assertUniqueCategoryName(normalizedName, branchId);
  const created = await prisma.category.create({
    data: {
      branchId,
      name,
      normalizedName,
      description: String(input.description ?? ""),
      isActive: input.isActive ?? true,
    },
    include: { branch: true, _count: { select: { products: true } } },
  });
  // Keeps the product forms' category lists current without a reload.
  revalidateCatalog();
  return created;
}

export async function updateCategory(
  user: User,
  categoryId: number,
  input: { name?: string; description?: string; isActive?: boolean; branchId?: unknown },
) {
  if (user.role !== "super_admin") throw forbidden(sk("errors.catalog.onlyAdminCanCreateCategory"));
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw notFound(sk("errors.catalog.categoryNotFound"));

  const data: Prisma.CategoryUpdateInput = {};
  let nextBranchId = existing.branchId;
  let nextNormalized = existing.normalizedName;
  if (input.branchId !== undefined) nextBranchId = await resolveCategoryScope(input.branchId);
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw validationError({ name: sk("errors.catalog.categoryNameRequired") });
    data.name = name;
    nextNormalized = normalizeCategoryName(name);
  }
  if (input.name !== undefined || input.branchId !== undefined) {
    await assertUniqueCategoryName(nextNormalized, nextBranchId, categoryId);
    data.normalizedName = nextNormalized;
    if (input.branchId !== undefined) {
      data.branch = nextBranchId === null ? { disconnect: true } : { connect: { id: nextBranchId } };
    }
  }
  if (input.description !== undefined) data.description = String(input.description);
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data,
    include: { branch: true, _count: { select: { products: true } } },
  });
  // A rename changes storefront section headings; a scope or status change moves
  // products in or out of the public catalogue entirely.
  revalidateCatalog();
  return updated;
}

/**
 * "Delete" a category (req #7/#8). To protect existing products + historical
 * orders, a category that still has products is DEACTIVATED (isActive=false)
 * rather than removed — the product→category links survive. A category with no
 * products is hard-deleted. Either way, no OrderItem/product data is corrupted.
 */
/**
 * req #3 — explicit Activate / Deactivate for a product category. SUPER ADMIN
 * ONLY (branch managers may never mutate categories). Repeating the current
 * state is a CONFLICT (409) rather than a silent no-op, and the actor +
 * timestamp are recorded for audit. Deactivating hides the category from the
 * customer catalogue/search and from new-product selection, but never touches
 * existing products or historical order snapshots.
 */
export async function setCategoryActive(user: User, categoryId: number, isActive: boolean) {
  if (user.role !== "super_admin") throw forbidden(sk("errors.catalog.onlyAdminCanCreateCategory"));
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw notFound(sk("errors.catalog.categoryNotFound"));
  if (existing.isActive === isActive) {
    throw conflict(sk("errors.catalog.categoryAlreadyInState"));
  }
  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { isActive, statusChangedById: user.id, statusChangedAt: new Date() },
    include: { branch: true, _count: { select: { products: true } } },
  });
  // Deactivating a category removes all of its products from customer surfaces.
  revalidateCatalog();
  return updated;
}

export async function deleteCategory(user: User, categoryId: number): Promise<{ deactivated: boolean }> {
  if (user.role !== "super_admin") throw forbidden(sk("errors.catalog.onlyAdminCanCreateCategory"));
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw notFound(sk("errors.catalog.categoryNotFound"));
  if (category._count.products > 0) {
    await prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
    revalidateCatalog();
    return { deactivated: true };
  }
  await prisma.category.delete({ where: { id: categoryId } });
  revalidateCatalog();
  return { deactivated: false };
}

// ── Variations ──────────────────────────────────────────────────────────
export interface VariationInput {
  id?: number;
  name: string;
  sizeLabel?: string;
  price: number;
  compareAtPrice?: number | null;
  servingInfo?: string;
  variantType?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
}

interface NormalizedVariation {
  id?: number;
  name: string;
  sizeLabel: string;
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  servingInfo: string;
  variantType: string;
  sortOrder: number;
  isDefault: boolean;
  isEnabled: boolean;
}

function money(value: unknown, field: string): Prisma.Decimal {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw validationError({ [field]: sk("errors.catalog.validPriceRequired") });
  }
  return new Prisma.Decimal(n.toFixed(2));
}

/**
 * Parse a variations payload (JSON string or array) into a validated,
 * normalized list. Enforces: ≥1 variation, ≥1 enabled, unique names, valid
 * prices, exactly one default (auto-selected among enabled when unset).
 */
export function normalizeVariations(raw: unknown): NormalizedVariation[] {
  let list: VariationInput[];
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw) as VariationInput[];
    } catch {
      throw validationError({ variations: sk("errors.catalog.variationsInvalid") });
    }
  } else if (Array.isArray(raw)) {
    list = raw as VariationInput[];
  } else {
    throw validationError({ variations: sk("errors.catalog.variationsRequired") });
  }

  if (!Array.isArray(list) || list.length === 0) {
    throw validationError({ variations: sk("errors.catalog.variationsRequired") });
  }

  const seen = new Set<string>();
  // Row-level problems are keyed by their STRUCTURED PATH (`variations.0.price`)
  // so the product form can render each message under that exact input instead
  // of showing one banner for the whole list.
  const normalized: NormalizedVariation[] = list.map((v, i) => {
    const name = String(v.name ?? "").trim();
    if (!name) {
      throw validationError({ [`variations.${i}.name`]: sk("errors.catalog.variationNameRequired") });
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw validationError({
        [`variations.${i}.name`]: sk("errors.catalog.variationNameDuplicate", { name }),
      });
    }
    seen.add(key);
    const compareAt =
      v.compareAtPrice === undefined || v.compareAtPrice === null || v.compareAtPrice === ("" as unknown)
        ? null
        : money(v.compareAtPrice, `variations.${i}.compare_at_price`);
    return {
      id: typeof v.id === "number" ? v.id : undefined,
      name,
      sizeLabel: String(v.sizeLabel ?? "").trim(),
      price: money(v.price, `variations.${i}.price`),
      compareAtPrice: compareAt,
      servingInfo: String(v.servingInfo ?? "").trim(),
      variantType: String(v.variantType ?? "").trim(),
      sortOrder: typeof v.sortOrder === "number" ? v.sortOrder : i,
      isDefault: Boolean(v.isDefault),
      isEnabled: v.isEnabled === undefined ? true : Boolean(v.isEnabled),
    };
  });

  const enabled = normalized.filter((v) => v.isEnabled);
  if (enabled.length === 0) {
    throw validationError({ variations: sk("errors.catalog.variationOneEnabledRequired") });
  }
  // Exactly one default, and it must be enabled.
  const enabledDefaults = enabled.filter((v) => v.isDefault);
  normalized.forEach((v) => (v.isDefault = false));
  const chosen = enabledDefaults[0] ?? enabled[0];
  chosen.isDefault = true;
  return normalized;
}

// ── Product create / update (transactional, with variations) ────────────
export interface ProductWriteInput {
  branchId?: number;
  name: string;
  description?: string;
  brand?: string | null;
  discount?: number;
  categoryId?: number | null;
  image?: string | null;
  isAvailable?: boolean;
  preparationTime?: number;
  isPopular?: boolean;
  isRecommended?: boolean;
  /** req #4 — crust policy: "THICK" | "THIN" | "BOTH" (stable internal values). */
  variationType?: string;
  variations: VariationInput[] | string;
}


/**
 * req #4 — resolve + validate the product crust policy.
 *
 * The dropdown is MANDATORY on the create/edit forms (which always submit a
 * value), and any value that IS supplied is validated here — a forged request
 * can never store an unknown crust policy. An ABSENT field falls back to the
 * documented safe default (`PRODUCT_VARIATION_TYPE_DEFAULT` = "THICK", a single
 * fixed crust) rather than 400-ing, so existing API clients that predate this
 * field keep working and no legacy product gains a mandatory customer choice.
 */
function resolveVariationType(value: unknown, fallback = PRODUCT_VARIATION_TYPE_DEFAULT): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return fallback;
  if (!isProductVariationType(raw)) {
    throw validationError({ variation_type: sk("errors.catalog.variationTypeInvalid") });
  }
  return raw;
}

export async function createProduct(user: User, input: ProductWriteInput): Promise<Product> {
  const branch = await resolveCatalogBranch(user, input.branchId);
  const name = input.name.trim();
  if (!name) throw validationError({ name: sk("errors.catalog.productNameRequired") });
  const brand = resolveProductBrand(branch, input.brand);
  const variations = normalizeVariations(input.variations);
  if (input.categoryId != null) await assertCategoryUsableInBranch(input.categoryId, branch.id);

  const basePrice = variations.find((v) => v.isDefault)?.price ?? variations[0].price;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        branch: { connect: { id: branch.id } },
        name,
        description: input.description ?? "",
        brand,
        price: basePrice, // legacy/base mirror of the default variation
        discount: new Prisma.Decimal((input.discount ?? 0).toFixed(2)),
        isAvailable: input.isAvailable ?? true,
        preparationTime: input.preparationTime ?? 20,
        isPopular: input.isPopular ?? false,
        isRecommended: input.isRecommended ?? false,
        variationType: resolveVariationType(input.variationType),
        ...(input.categoryId != null ? { category: { connect: { id: input.categoryId } } } : {}),
        ...(input.image ? { image: input.image } : {}),
        variations: {
          create: variations.map((v) => ({
            name: v.name,
            sizeLabel: v.sizeLabel,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            servingInfo: v.servingInfo,
            variantType: v.variantType,
            sortOrder: v.sortOrder,
            isDefault: v.isDefault,
            isEnabled: v.isEnabled,
          })),
        },
      },
      include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
    });
    return product;
  }).then((product) => {
    // A newly created product is immediately eligible (or not) on every public
    // surface — invalidate them all so no restart or rebuild is ever required.
    revalidateCatalog({ productId: product.id, branchId: product.branchId });
    return product;
  });
}

/**
 * Update a product's scalar fields and (optionally) replace its variation set.
 * When `variations` is provided, existing variations are reconciled: rows with
 * a matching id are updated, unknown ids are created, and omitted ids are
 * deleted — all inside one transaction so the ≥1-enabled invariant holds.
 */
export async function updateProduct(
  user: User,
  productId: number,
  input: Partial<ProductWriteInput> & { variations?: VariationInput[] | string },
): Promise<Product> {
  const existing = await productForManage(user, productId);
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: existing.branchId } });

  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw validationError({ name: sk("errors.catalog.productNameRequired") });
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.brand !== undefined) data.brand = resolveProductBrand(branch, input.brand);
  if (input.discount !== undefined) data.discount = new Prisma.Decimal(Number(input.discount).toFixed(2));
  if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable;
  if (input.preparationTime !== undefined) data.preparationTime = input.preparationTime;
  if (input.isPopular !== undefined) data.isPopular = input.isPopular;
  if (input.isRecommended !== undefined) data.isRecommended = input.isRecommended;
  // req #4 — only overwrite when explicitly supplied, so a form that omits the
  // field (e.g. the Super Admin form) can never erase the product's policy.
  if (input.variationType !== undefined) {
    data.variationType = resolveVariationType(input.variationType, existing.variationType);
  }
  if (input.image) data.image = input.image;
  if (input.categoryId !== undefined) {
    if (input.categoryId === null) data.category = { disconnect: true };
    else {
      await assertCategoryUsableInBranch(input.categoryId, branch.id);
      data.category = { connect: { id: input.categoryId } };
    }
  }

  const variations = input.variations !== undefined ? normalizeVariations(input.variations) : null;

  return prisma.$transaction(async (tx) => {
    if (variations) {
      const current = await tx.productVariation.findMany({ where: { productId } });
      const keepIds = new Set(variations.filter((v) => v.id).map((v) => v.id!));
      const toDelete = current.filter((c) => !keepIds.has(c.id)).map((c) => c.id);
      if (toDelete.length) {
        await tx.productVariation.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const v of variations) {
        const payload = {
          name: v.name,
          sizeLabel: v.sizeLabel,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          servingInfo: v.servingInfo,
          variantType: v.variantType,
          sortOrder: v.sortOrder,
          isDefault: v.isDefault,
          isEnabled: v.isEnabled,
        };
        if (v.id && current.some((c) => c.id === v.id)) {
          await tx.productVariation.update({ where: { id: v.id }, data: payload });
        } else {
          await tx.productVariation.create({ data: { ...payload, productId } });
        }
      }
      const base = variations.find((v) => v.isDefault)?.price ?? variations[0].price;
      data.price = base;
    }
    return tx.product.update({
      where: { id: productId },
      data,
      include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
    });
  }).then((product) => {
    revalidateCatalog({ productId: product.id, branchId: product.branchId });
    return product;
  });
}

// ── Single-variation operations ─────────────────────────────────────────
async function variationForManage(user: User, variationId: number) {
  const variation = await prisma.productVariation.findUnique({ where: { id: variationId } });
  if (!variation) throw notFound(sk("errors.catalog.variationNotFound"));
  await productForManage(user, variation.productId); // enforces branch scope
  return variation;
}

export async function setVariationEnabled(user: User, variationId: number, enabled: boolean) {
  const variation = await variationForManage(user, variationId);
  return prisma.$transaction(async (tx) => {
    if (!enabled) {
      const enabledCount = await tx.productVariation.count({
        where: { productId: variation.productId, isEnabled: true },
      });
      if (enabledCount <= 1) {
        throw validationError({ variations: sk("errors.catalog.variationOneEnabledRequired") });
      }
    }
    const updated = await tx.productVariation.update({ where: { id: variationId }, data: { isEnabled: enabled } });
    await ensureDefault(tx, variation.productId);
    return updated;
  }).then((updated) => {
    // Disabling the last enabled size makes the product unpurchasable, so this
    // changes public eligibility just as much as a status flip does.
    revalidateCatalog({ productId: variation.productId });
    return updated;
  });
}

export async function deleteVariation(user: User, variationId: number) {
  const variation = await variationForManage(user, variationId);
  return prisma.$transaction(async (tx) => {
    const total = await tx.productVariation.count({ where: { productId: variation.productId } });
    if (total <= 1) throw validationError({ variations: sk("errors.catalog.variationLastCannotDelete") });
    await tx.productVariation.delete({ where: { id: variationId } });
    await ensureDefault(tx, variation.productId);
  }).then(() => {
    revalidateCatalog({ productId: variation.productId });
  });
}

export async function setVariationDefault(user: User, variationId: number) {
  const variation = await variationForManage(user, variationId);
  if (!variation.isEnabled) throw validationError({ variations: sk("errors.catalog.variationDefaultMustBeEnabled") });
  return prisma.$transaction(async (tx) => {
    await tx.productVariation.updateMany({ where: { productId: variation.productId }, data: { isDefault: false } });
    const updated = await tx.productVariation.update({ where: { id: variationId }, data: { isDefault: true } });
    await tx.product.update({ where: { id: variation.productId }, data: { price: updated.price } });
    return updated;
  }).then((updated) => {
    // The default variation IS the displayed base price.
    revalidateCatalog({ productId: variation.productId });
    return updated;
  });
}

/** Re-pick a default when the current one is gone/disabled, and sync base price. */
async function ensureDefault(tx: Prisma.TransactionClient, productId: number) {
  const enabled = await tx.productVariation.findMany({
    where: { productId, isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });
  if (enabled.length === 0) return;
  const hasDefault = enabled.some((v) => v.isDefault);
  const chosen = hasDefault ? enabled.find((v) => v.isDefault)! : enabled[0];
  if (!hasDefault) {
    await tx.productVariation.updateMany({ where: { productId }, data: { isDefault: false } });
    await tx.productVariation.update({ where: { id: chosen.id }, data: { isDefault: true } });
  }
  await tx.product.update({ where: { id: productId }, data: { price: chosen.price } });
}
