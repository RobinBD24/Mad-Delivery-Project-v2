import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";
import { createOrder } from "@/lib/services/orders";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/reorder — one-click reorder: duplicates the items of a
// previous own order into a fresh pending order at CURRENT prices.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiRole("customer");
  const { id } = await ctx.params;

  const source = await prisma.order.findFirst({
    where: { id: Number(id), customerId: me.id },
    include: { items: true },
  });
  if (!source) throw notFound(sk("errors.orders.orderNotFound"));
  if (source.items.length === 0) throw validationError({ items: sk("errors.orders.noItemsInOrder") });

  const order = await createOrder({
    customerId: me.id,
    branchId: source.branchId,
    items: source.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      food_note: i.foodNote,
    })),
    paymentMethod: source.paymentMethod,
    deliveryAddress: source.deliveryAddress,
    foodNotes: source.foodNotes,
  });
  const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  return created(serializeOrder(full));
});
