import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { serializeBranch } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/branches/[id]/deactivate  { reason? } — hold branch operations.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden();
  const { id } = await ctx.params;
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) } });
  if (!branch) throw notFound(sk("errors.catalog.branchNotFound"));
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const updated = await prisma.branch.update({
    where: { id: Number(id) },
    data: { isActive: false, holdReason: String(body.reason ?? "").trim() },
    include: { manager: true },
  });
  // Holding a branch removes all of its products from customer surfaces.
  revalidateCatalog({ branchId: updated.id });
  return json(serializeBranch(updated));
});
