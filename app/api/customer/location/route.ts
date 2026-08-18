import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { coordinateOrNaN } from "@/lib/services/geo";
import { saveCustomerLocation } from "@/lib/services/customer-location";

// POST /api/customer/location { lat, lng, accuracy? } — save the customer's
// latest validated GPS fix (req #21). Own identity only; server validates the
// coordinates and never overwrites a saved address.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    accuracy?: number;
    /** PHASE E — when the browser captured the fix; a stale one is refused. */
    captured_at?: number | string;
  };
  await saveCustomerLocation(
    me,
    coordinateOrNaN(body.lat),
    coordinateOrNaN(body.lng),
    body.accuracy ?? null,
    body.captured_at ?? null,
  );
  return json({ ok: true });
});
