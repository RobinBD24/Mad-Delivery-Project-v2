import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { todayDuty } from "@/lib/selectors";
import { serializeDutyLog } from "@/lib/serializers";

// GET /api/riders/duty/status — today's duty log or null.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const duty = await todayDuty(me.id);
  return json(duty ? serializeDutyLog(duty) : null);
});
