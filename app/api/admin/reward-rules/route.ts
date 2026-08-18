import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeRewardEarningRule } from "@/lib/serializers";
import { createEarningRule, listEarningRules, parseRuleBody } from "@/lib/services/reward-rules";

// PHASE H — reward EARNING RULES. Super admin only; the service enforces it, so
// a direct API call from any other role is refused exactly like the hidden UI.

/** GET /api/admin/reward-rules?include_archived=true */
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const includeArchived = new URL(req.url).searchParams.get("include_archived") === "true";
  const rules = await listEarningRules(me, { includeArchived });
  return json({ count: rules.length, results: rules.map(serializeRewardEarningRule) });
});

/** POST /api/admin/reward-rules — create. */
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rule = await createEarningRule(me, parseRuleBody(body));
  return json(serializeRewardEarningRule(rule), 201);
});
