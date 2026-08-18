import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { serializeProduct } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/products/[id]/unhold — lifts the super-admin cross-branch hold.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const params = await ctx.params;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw notFound(sk("errors.catalog.productNotFound"));
  }
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound(sk("errors.catalog.productNotFound"));
  await prisma.product.updateMany({ where: { name: product.name }, data: { heldByAdmin: false } });
  const updated = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    include: { branch: true, category: true },
  });
  // Resuming restores ordering across every branch the hold covered.
  const affected = await prisma.product.findMany({
    where: { name: product.name },
    select: { branchId: true },
  });
  for (const branchId of [...new Set(affected.map((p) => p.branchId))]) {
    revalidateCatalog({ branchId });
  }
  revalidateCatalog({ productId: updated.id });
  return json(serializeProduct(updated));
});
