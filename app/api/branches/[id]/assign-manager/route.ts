import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeBranch } from "@/lib/serializers";
import { assignBranchManager } from "@/lib/services/branches";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/branches/[id]/assign-manager  { manager_id | null, notes? }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden(sk("errors.catalog.onlySuperAdminCanAssignManager"));
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { manager_id?: number | null; notes?: string };

  await assignBranchManager({
    branchId: Number(id),
    managerId: body.manager_id ?? null,
    assignedById: me.id,
    notes: String(body.notes ?? ""),
  });

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: Number(id) }, include: { manager: true } });
  return json(serializeBranch(branch));
});
