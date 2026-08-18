import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { serializeBranch } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

async function setActive(id: number, isActive: boolean) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw notFound(sk("errors.catalog.branchNotFound"));
  const updated = await prisma.branch.update({
    where: { id },
    data: { isActive, holdReason: isActive ? "" : branch.holdReason },
    include: { manager: true },
  });
  // A branch going inactive removes ALL of its products from customer surfaces
  // (LIVE_BRANCH in the shared eligibility rules); reactivating restores them.
  revalidateCatalog({ branchId: updated.id });
  return serializeBranch(updated);
}

// POST /api/branches/[id]/activate
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden();
  const { id } = await ctx.params;
  return json(await setActive(Number(id), true));
});
