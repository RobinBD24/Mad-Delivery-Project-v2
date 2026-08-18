import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { serializeDutySession, startDuty } from "@/lib/services/rider-duty";

// POST /api/rider/duty/start  { branch_id } — go online on a branch (new session).
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { branch_id?: number };
  const session = await startDuty(me, Number(body.branch_id));
  return created(serializeDutySession(session));
});
