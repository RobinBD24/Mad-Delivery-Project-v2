import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeOrder } from "@/lib/serializers";
import { ORDER_INCLUDE } from "@/lib/selectors";
import { prisma } from "@/lib/db";
import { decideBkashPayment } from "@/lib/services/payments";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/payment/verify { approve, reason? } — PHASE S.
// Accounts (any branch) or the OWN-branch manager decides a pending manual
// payment. Re-deciding an already-decided payment returns 409 so the audit
// trail can never be overwritten.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { approve?: boolean; reason?: string };
  await decideBkashPayment(me, Number(id), Boolean(body.approve), body.reason ?? "");
  const full = await prisma.order.findUniqueOrThrow({ where: { id: Number(id) }, include: ORDER_INCLUDE });
  return json(serializeOrder(full));
});
