import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeArea, setAreaHold } from "@/lib/services/delivery-areas";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/delivery-areas/[id]/hold  { reason? } — block NEW delivery orders
// for this area. Existing orders are untouched. SA any / BM own branch.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const area = await setAreaHold(me, Number(id), true, body.reason ?? "");
  return json(serializeArea(area));
});
