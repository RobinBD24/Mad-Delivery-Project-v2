import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { paginated } from "@/lib/http/respond";
import { dutyHistory, serializeDutySession } from "@/lib/services/rider-duty";

// GET /api/rider/duty/history — the rider's own branch-duty session history.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const rows = await dutyHistory(me.id);
  return paginated(rows.map(serializeDutySession));
});
