import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { respondToAssignment } from "@/lib/services/rider-assignment";

type Ctx = { params: Promise<{ orderId: string }> };

// POST /api/rider/assignments/[orderId]/respond { action: accept|reject, reason? }
// (req #6/#7). Server verifies assignment + active session + state; reject needs
// a reason; idempotent per terminal state.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("rider");
  const { orderId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (body.action !== "accept" && body.action !== "reject") {
    throw validationError({ action: sk("errors.rider.invalidAssignmentAction") });
  }
  const result = await respondToAssignment(me, Number(orderId), body.action, body.reason ?? "");
  return json(result);
});
