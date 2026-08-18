import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";
import { serializeProduct } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/products/[id]/toggle-availability  { reason? }
// Deactivation requires a reason (PDF); reactivation clears it.
//
// SUPER ADMIN may deactivate/reactivate any branch's product — it is part of the
// full product control the role is meant to have, and doing it here (rather than
// through a generic PATCH) keeps the mandatory deactivation reason on ONE path.
// A BRANCH MANAGER stays confined to the branch they are assigned to; every
// other role is refused. Enforced here, server-side, not by hiding a button.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "branch_manager" && me.role !== "super_admin") throw forbidden();
  const params = await ctx.params;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw notFound(sk("errors.catalog.productNotFound"));
  }
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound(sk("errors.catalog.productNotFound"));
  if (me.role === "branch_manager") {
    const branch = await branchForManager(me.id);
    if (!branch) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    if (product.branchId !== branch.id) throw forbidden(sk("errors.catalog.productNotYourBranch"));
  }
  // A soft-deleted product is not a thing to activate — it is gone from every
  // customer surface by definition.
  if (product.deletedAt) throw notFound(sk("errors.catalog.productNotFound"));

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const deactivating = product.isAvailable;
  const reason = String(body.reason ?? "").trim();
  if (deactivating && !reason) {
    throw validationError({ reason: sk("errors.catalog.deactivationReasonRequired") });
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      isAvailable: !product.isAvailable,
      deactivationReason: deactivating ? reason : "",
    },
    include: { branch: true, category: true },
  });
  // Deactivating removes the product from customer surfaces; reactivating
  // restores it. Both must land without a restart or rebuild.
  revalidateCatalog({ productId: updated.id, branchId: updated.branchId });
  return json(serializeProduct(updated));
});
