import { requireApproved } from "@/lib/auth/current-user";
import { parseDeliveryAreaQuery } from "@/lib/delivery-areas/query";
import { handle } from "@/lib/http/errors";
import { created, json } from "@/lib/http/respond";
import {
  createArea,
  deliveryAreaListForUser,
  serializeArea,
} from "@/lib/services/delivery-areas";

// GET /api/delivery-areas?branch_id=&status=active|held — super admin (all /
// filtered) or branch manager (own branch only, enforced in the service).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const query = parseDeliveryAreaQuery(new URL(req.url).searchParams);
  const result = await deliveryAreaListForUser(me, query);
  return json({
    count: result.count,
    next: null,
    previous: null,
    results: result.results,
    page: result.page,
    page_size: result.pageSize,
    summary: result.summary,
  });
});

// POST /api/delivery-areas — super admin (any branch via branch_id) or branch
// manager (own branch; submitted branch_id ignored → no spoofing).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    branch_id?: number;
    name?: string;
    estimated_delivery_minutes?: unknown;
    delivery_charge?: unknown;
    center_lat?: number;
    center_lng?: number;
    is_active?: unknown;
  };
  const area = await createArea(me, {
    branchId: body.branch_id,
    name: body.name ?? "",
    estimatedDeliveryMinutes: body.estimated_delivery_minutes,
    deliveryCharge: body.delivery_charge,
    centerLat: body.center_lat,
    centerLng: body.center_lng,
    isActive: body.is_active,
  });
  return created(serializeArea(area));
});
