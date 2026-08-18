import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { createZone, serializeZone, zonesForBranch } from "@/lib/services/delivery";
import { resolveManageableBranch } from "@/lib/services/branch-ops";

function positiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

// GET /api/delivery-zones?branch_id= — zones for a branch the user may manage.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branch = await resolveManageableBranch(
    me,
    positiveInteger(url.searchParams.get("branch_id")),
  );
  const zones = await zonesForBranch(branch.id);
  return paginated(zones.map(serializeZone));
});

// POST /api/delivery-zones — create a zone (BM own branch / SA any).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    branch_id?: number;
    name?: string;
    center_lat?: number;
    center_lng?: number;
    radius_km?: number;
    delivery_fee?: number;
    is_active?: boolean;
  };
  const zone = await createZone(me, {
    branchId: positiveInteger(body.branch_id),
    name: String(body.name ?? ""),
    centerLat: Number(body.center_lat),
    centerLng: Number(body.center_lng),
    radiusKm: Number(body.radius_km),
    deliveryFee: body.delivery_fee != null ? Number(body.delivery_fee) : 0,
    isActive: body.is_active,
  });
  return created(serializeZone(zone));
});
