import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { refundRamadan, serializePayment } from "@/lib/services/ramadan";

type Ctx = { params: Promise<{ id: string }> };
// POST /api/ramadan/reservations/[id]/refund  { amount } — accounts / SA only.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { amount?: number };
  const p = await refundRamadan(me, Number(id), Number(b.amount));
  return json(serializePayment(p));
});
