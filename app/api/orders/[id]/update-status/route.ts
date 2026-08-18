import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";
import { updateOrderStatus } from "@/lib/services/orders";
import { ALLOWED_TRANSITIONS } from "@/lib/constants/orders";
import type { OrderStatus } from "@/types";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/update-status  { status }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; reason?: string };
  const newStatus = body.status as OrderStatus;
  if (!newStatus || !(newStatus in ALLOWED_TRANSITIONS)) {
    throw validationError({ status: sk("errors.orders.selectValidStatus") });
  }

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: { branch: { select: { managerId: true } } },
  });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));

  await updateOrderStatus({ order, newStatus, user: me,
    // PHASE J — rejection/cancellation reason, stored exactly as typed.
    reason: body.reason ?? "",
  });
  const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  return json(serializeOrder(full));
});
