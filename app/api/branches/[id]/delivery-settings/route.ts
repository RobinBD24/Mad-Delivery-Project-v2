import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeBranch } from "@/lib/serializers";
import { updateBranchDeliverySettings } from "@/lib/services/branches";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/branches/[id]/delivery-settings { delivery_radius_km, delivery_fee }
// PHASE 11 — super_admin may configure any branch; a branch_manager may configure
// ONLY their own assigned branch (the id is resolved against the assignment, so a
// forged id is refused, not honoured). Values are validated Decimal-safe in the
// service. Changes apply to FUTURE orders only — existing orders keep their
// charge/estimate/distance snapshots.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    delivery_radius_km?: unknown;
    delivery_fee?: unknown;
  };
  const updated = await updateBranchDeliverySettings(me, Number(id), {
    ...(body.delivery_radius_km !== undefined ? { deliveryRadiusKm: body.delivery_radius_km } : {}),
    ...(body.delivery_fee !== undefined ? { deliveryFee: body.delivery_fee } : {}),
  });
  return json(serializeBranch(updated));
});
