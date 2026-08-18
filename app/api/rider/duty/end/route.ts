import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { endDuty, serializeDutySession } from "@/lib/services/rider-duty";

// POST /api/rider/duty/end — end the active session (blocked with an active delivery).
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const session = await endDuty(me, body.reason === "switch" ? "switch" : "offline");
  return json(serializeDutySession(session));
});
