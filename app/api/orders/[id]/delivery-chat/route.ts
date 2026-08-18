import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { deliveryThreadForOrder } from "@/lib/services/rider-duty";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/orders/[id]/delivery-chat — the active delivery-chat thread id for an
// order (null until the rider confirms receive). Members only.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({ where: { id: Number(id) } });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));
  const isMember = me.id === order.customerId || me.id === order.riderId || me.role === "super_admin";
  if (!isMember) throw forbidden();
  const thread = await deliveryThreadForOrder(order.id);
  return json({ thread: thread ? thread.id : null, status: thread ? thread.status : null });
});
