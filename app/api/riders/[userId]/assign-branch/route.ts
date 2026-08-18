import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeRiderProfile } from "@/lib/serializers";
import { assignRiderBranch } from "@/lib/services/riders";

type Ctx = { params: Promise<{ userId: string }> };

// POST /api/riders/[userId]/assign-branch  { branch_id | null } — Super Admin only.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden(sk("errors.money.onlySuperAdminAssignRiderBranch"));
  const { userId } = await ctx.params;
  const rider = await prisma.user.findFirst({ where: { id: Number(userId), role: "rider" } });
  if (!rider) throw notFound(sk("errors.money.riderNotFound"));

  const body = (await req.json().catch(() => ({}))) as { branch_id?: number | null };
  await assignRiderBranch({ riderId: rider.id, branchId: body.branch_id ?? null });

  const profile = await prisma.riderProfile.findUniqueOrThrow({
    where: { userId: rider.id },
    include: { user: true, assignedBranch: true },
  });
  return json(serializeRiderProfile(profile));
});
