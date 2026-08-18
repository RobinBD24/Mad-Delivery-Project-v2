import { requireApproved } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { checkCoverage } from "@/lib/services/delivery";
import { isValidLatLng } from "@/lib/services/geo";

// POST /api/delivery/coverage  { branch_id, lat, lng, brand? }
// Server-side coverage decision — never trusts a client-computed result. When
// out of coverage, the nearest eligible pickup branch is returned.
export const POST = handle(async (req: Request) => {
  await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    branch_id?: number;
    lat?: number | string;
    lng?: number | string;
    brand?: string;
  };
  if (!body.branch_id) throw validationError({ branch_id: sk("errors.orders.selectBranch") });
  if (!isValidLatLng(body.lat, body.lng)) throw validationError({ lat: sk("errors.ops.invalidCoordinates") });
  const outcome = await checkCoverage(
    Number(body.branch_id),
    { lat: Number(body.lat), lng: Number(body.lng) },
    { brand: body.brand ?? null },
  );
  return json(outcome);
});
