import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { setRewardProgramActive } from "@/lib/services/rewards";

// POST /api/admin/rewards/status { is_active } — PHASE G.
// SUPER ADMIN ONLY (enforced in the service, never by hiding the UI). Repeating
// the current state returns 409. Pausing stops FUTURE earning/redemption only;
// the reward ledger and every historical entry remain intact and readable.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as { is_active?: boolean };
  const result = await setRewardProgramActive(me, Boolean(body.is_active));
  return json(result);
});
