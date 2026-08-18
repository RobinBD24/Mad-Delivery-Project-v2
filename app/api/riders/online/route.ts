import { requireApiRole } from "@/lib/auth/current-user";
import { handle, validationError, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { activeDutySession, endDuty } from "@/lib/services/rider-duty";

// POST /api/riders/online  { online }
// A rider can only be "online" while on an active branch duty session. Going
// online is done via /api/rider/duty/start (which selects a branch); this route
// rejects online-without-a-session and routes offline through endDuty (which
// enforces the active-delivery guard).
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { online?: boolean };
  if (body.online) {
    const active = await activeDutySession(me.id);
    if (!active) throw validationError({ branch_id: sk("errors.rider.selectBranch") });
    return json({ is_online: true });
  }
  await endDuty(me);
  return json({ is_online: false });
});
