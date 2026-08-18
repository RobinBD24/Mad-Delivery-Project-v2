import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeWithdrawal } from "@/lib/serializers";
import { decideWithdrawal } from "@/lib/services/wallet";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/accounts/withdrawals/[id]/decide  { decision: approve|reject|pay, reason? }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("accounts", "super_admin");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; reason?: string };

  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject" && decision !== "pay") {
    throw validationError({ decision: sk("errors.money.selectValidDecision") });
  }
  const withdrawal = await decideWithdrawal(Number(id), decision, me, String(body.reason ?? ""));
  return json(serializeWithdrawal(withdrawal));
});
