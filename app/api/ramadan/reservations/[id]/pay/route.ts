import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { payRamadanAdvance, serializePayment, serializeReservation } from "@/lib/services/ramadan";

type Ctx = { params: Promise<{ id: string }> };
// POST /api/ramadan/reservations/[id]/pay  { idempotency_key, outcome? }
// Demo advance payment — idempotent via idempotency_key.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { idempotency_key?: string; outcome?: string; gateway_ref?: string };
  const { payment, reservation } = await payRamadanAdvance(me, Number(id), {
    idempotencyKey: String(b.idempotency_key ?? ""), outcome: b.outcome, gatewayRef: b.gateway_ref,
  });
  return json({ payment: serializePayment(payment), reservation: serializeReservation(reservation) });
});
