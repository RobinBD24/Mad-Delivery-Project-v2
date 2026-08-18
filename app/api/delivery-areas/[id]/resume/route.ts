import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeArea, setAreaHold } from "@/lib/services/delivery-areas";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/delivery-areas/[id]/resume — resume delivery for this area.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const area = await setAreaHold(me, Number(id), false);
  return json(serializeArea(area));
});
