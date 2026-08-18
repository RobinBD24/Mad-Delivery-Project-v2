import { requireApiRole } from "@/lib/auth/current-user";
import { conflict, handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { coordinateOrNaN, isValidLatLng } from "@/lib/services/geo";
import { assertFreshFix } from "@/lib/services/customer-location";
import { pushRiderLocation } from "@/lib/services/rider-location";
import { activeDutySession } from "@/lib/services/rider-duty";

// POST /api/riders/location { lat, lng, accuracy?, order_id? } — the rider pushes
// their live GPS location (req #12). Server-side: authenticated rider only (own
// id — never a forged rider id), MUST be on an active duty session, and the
// coordinates/accuracy must be finite + in range. Client throttling reduces
// writes; the server still validates every point.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    accuracy?: number;
    order_id?: number;
    /** PHASE E — capture time; a stale fix is refused, not stored as current. */
    captured_at?: number | string;
  };
  const lat = coordinateOrNaN(body.lat);
  const lng = coordinateOrNaN(body.lng);
  if (!isValidLatLng(lat, lng)) {
    throw validationError({ location: sk("errors.money.enterValidLocation") });
  }
  if (body.accuracy != null && (!Number.isFinite(Number(body.accuracy)) || Number(body.accuracy) < 0)) {
    throw validationError({ accuracy: sk("errors.orders.invalidCoordinates") });
  }
  assertFreshFix(body.captured_at ?? null);
  // Location is only tracked while on duty (req #12 — stop updates when offline).
  const session = await activeDutySession(me.id);
  if (!session) throw conflict(sk("errors.rider.selectBranch"));

  await pushRiderLocation(me.id, lat, lng, body.accuracy ?? null, body.order_id ?? null);
  return json({ ok: true });
});
