import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";
import { assignRiderToOrder } from "@/lib/services/orders";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/assign-rider  { rider_id | null }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin" && me.role !== "branch_manager") {
    throw forbidden(sk("errors.orders.noPermissionToAssignRider"));
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { rider_id?: number | null };

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: { branch: { select: { managerId: true } } },
  });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));

  await assignRiderToOrder({ order, riderId: body.rider_id ?? null, actingUser: me });
  const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  return json(serializeOrder(full));
});
