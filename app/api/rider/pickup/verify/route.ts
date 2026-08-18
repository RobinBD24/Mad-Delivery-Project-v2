import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { verifyPickupByOrderNumber } from "@/lib/services/rider-assignment";

// POST /api/rider/pickup/verify { order_number } — pickup verification by the
// unique order number (req #8/#16). Verifies assignment + branch + active
// session, then runs receive-confirmation.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { order_number?: string };
  const result = await verifyPickupByOrderNumber(me, body.order_number ?? "");
  return json(result);
});
