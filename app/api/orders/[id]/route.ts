import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE, ordersWhereForUser } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/orders/[id] — visible only within the caller's role scope.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw notFound(sk("errors.orders.orderNotFound"));
  }
  const scope = await ordersWhereForUser(me);
  if (scope === null) throw forbidden();

  const order = await prisma.order.findFirst({
    where: { id: orderId, ...scope },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));
  return json(serializeOrder(order));
});
