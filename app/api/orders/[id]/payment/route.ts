import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeOrder } from "@/lib/serializers";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { prisma } from "@/lib/db";
import { submitBkashPayment } from "@/lib/services/payments";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/payment { transaction_id, payer_phone } — PHASE S.
// The CUSTOMER submits a manual bKash payment for their OWN order. The order
// moves to pending_verification; it is never auto-marked paid.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("customer");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    transaction_id?: unknown;
    payer_phone?: unknown;
  };
  await submitBkashPayment(me, Number(id), {
    transactionId: body.transaction_id,
    payerPhone: body.payer_phone,
  });
  const full = await prisma.order.findUniqueOrThrow({ where: { id: Number(id) }, include: ORDER_INCLUDE });
  return json(serializeOrder(full));
});
