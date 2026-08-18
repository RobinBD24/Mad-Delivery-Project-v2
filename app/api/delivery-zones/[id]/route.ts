import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { deleteZone, serializeZone, updateZone } from "@/lib/services/delivery";

type Ctx = { params: Promise<{ id: string }> };

function zoneId(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw notFound();
  return parsed;
}

// PATCH /api/delivery-zones/[id] — update (branch-scoped in the service).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const zone = await updateZone(me, zoneId(id), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.center_lat !== undefined ? { centerLat: Number(body.center_lat) } : {}),
    ...(body.center_lng !== undefined ? { centerLng: Number(body.center_lng) } : {}),
    ...(body.radius_km !== undefined ? { radiusKm: Number(body.radius_km) } : {}),
    ...(body.delivery_fee !== undefined ? { deliveryFee: Number(body.delivery_fee) } : {}),
    ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
  });
  return json(serializeZone(zone));
});

// DELETE /api/delivery-zones/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await deleteZone(me, zoneId(id));
  return noContent();
});
