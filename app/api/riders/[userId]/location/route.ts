import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/riders/[userId]/location — track a rider's live position.
// Customers may track only a rider assigned to one of THEIR active orders;
// branch managers only riders in their branch; super_admin/management always.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { userId } = await ctx.params;
  const riderId = Number(userId);

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: riderId },
    include: { user: true },
  });
  if (!profile) throw notFound(sk("errors.money.riderNotFound"));

  if (me.role === "customer") {
    const linked = await prisma.order.findFirst({
      where: { customerId: me.id, riderId, status: { notIn: ["delivered", "cancelled"] } },
    });
    if (!linked) throw forbidden();
  } else if (me.role === "branch_manager") {
    const branch = await branchForManager(me.id);
    if (profile.assignedBranchId !== branch?.id) throw forbidden();
  } else if (me.role !== "super_admin" && me.role !== "management") {
    throw forbidden();
  }

  return json({
    rider: riderId,
    rider_name: `${profile.user.firstName} ${profile.user.lastName}`.trim() || profile.user.username,
    is_online: profile.isOnline,
    latitude: profile.currentLat?.toString() ?? null,
    longitude: profile.currentLng?.toString() ?? null,
    last_ping_at: profile.lastPingAt?.toISOString() ?? null,
  });
});
