import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeArea, updateArea } from "@/lib/services/delivery-areas";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/delivery-areas/[id] — update name / time / charge / coords.
// Ownership enforced in the service (SA any, BM own branch only).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    estimated_delivery_minutes?: unknown;
    delivery_charge?: unknown;
    center_lat?: number;
    center_lng?: number;
    is_active?: unknown;
  };
  const area = await updateArea(me, Number(id), {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.estimated_delivery_minutes !== undefined ? { estimatedDeliveryMinutes: body.estimated_delivery_minutes } : {}),
    ...(body.delivery_charge !== undefined ? { deliveryCharge: body.delivery_charge } : {}),
    ...(body.center_lat !== undefined ? { centerLat: body.center_lat } : {}),
    ...(body.center_lng !== undefined ? { centerLng: body.center_lng } : {}),
    ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
  });
  return json(serializeArea(area));
});
