import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound, sk } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { json } from "@/lib/http/respond";
import { saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { serializeProduct } from "@/lib/serializers";
import { resolvedBranchIdFor } from "@/lib/services/customer-branch";
import {
  CUSTOMER_PRODUCT_INCLUDE,
  customerProductWhere,
  isProductOrderable,
} from "@/lib/services/product-eligibility";
import {
  productForManage,
  softDeleteProduct,
  updateProduct,
} from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

function productId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw notFound(sk("errors.catalog.productNotFound"));
  }
  return id;
}

// GET /api/products/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  const id = productId(params.id);
  let product;
  if (me.role === "super_admin" || me.role === "branch_manager") {
    await productForManage(me, id);
    product = await prisma.product.findUnique({
      where: { id },
      include: {
        branch: true,
        category: true,
        variations: { orderBy: { sortOrder: "asc" } },
      },
    });
  } else {
    // A direct product URL is held to exactly the rules the listings use — the
    // shared customer eligibility clause, plus the customer's SERVER-RESOLVED
    // branch. Without the branch scope a customer could read (and then try to
    // order) any other branch's product simply by guessing its id. No resolvable
    // branch → nothing is readable.
    const branchId = await resolvedBranchIdFor(me.id);
    if (branchId == null) throw notFound(sk("errors.catalog.productNotFound"));
    const row = await prisma.product.findFirst({
      where: customerProductWhere({ ids: [id], branchId }),
      include: CUSTOMER_PRODUCT_INCLUDE,
    });
    product = row && isProductOrderable(row) ? row : null;
  }
  if (!product) throw notFound(sk("errors.catalog.productNotFound"));
  return json(serializeProduct(product));
});

// PATCH /api/products/[id] — super admin (any branch) or the assigned branch
// manager (own branch, IDOR-guarded in the service). `variations` (JSON string)
// replaces the variation set when present.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  const id = productId(params.id);
  const { fields, file, has } = await parseBody(req);
  const image = file("image");
  const product = await updateProduct(me, id, {
    ...(has("name") ? { name: fields.name } : {}),
    ...(has("description") ? { description: fields.description } : {}),
    ...(has("brand") ? { brand: fields.brand } : {}),
    ...(has("discount") ? { discount: Number(fields.discount || 0) } : {}),
    ...(has("category") ? { categoryId: fields.category ? Number(fields.category) : null } : {}),
    ...(has("is_available") ? { isAvailable: fields.is_available === "true" } : {}),
    ...(has("preparation_time") ? { preparationTime: Number(fields.preparation_time) } : {}),
    ...(has("is_popular") ? { isPopular: fields.is_popular === "true" } : {}),
    ...(has("is_recommended") ? { isRecommended: fields.is_recommended === "true" } : {}),
    // req #4 — preserved on edit; absent field never erases the stored policy.
    ...(has("variation_type") ? { variationType: fields.variation_type } : {}),
    ...(image ? { image: await saveUpload(image, "products", "image") } : {}),
    ...(has("variations") ? { variations: fields.variations } : {}),
  });
  return json(serializeProduct(product));
});

// DELETE /api/products/[id] — SUPER ADMIN ONLY (req #4). Soft delete: keeps
// historical OrderItem / FoodReview rows intact, hides the product everywhere.
// Branch managers + all other roles are rejected server-side (403).
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  const product = await softDeleteProduct(me, productId(params.id));
  return json(serializeProduct(product));
});
