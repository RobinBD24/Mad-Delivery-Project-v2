import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeRewardEarningRule } from "@/lib/serializers";
import {
  deleteEarningRule,
  getEarningRule,
  parseRuleBody,
  setEarningRuleActive,
  updateEarningRule,
} from "@/lib/services/reward-rules";

type Ctx = { params: Promise<{ id: string }> };

function ruleId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

// PHASE H — view / edit / activate-deactivate / safe-delete one earning rule.
// Super admin only (enforced in the service).

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  return json(serializeRewardEarningRule(await getEarningRule(me, ruleId(params.id))));
});

/**
 * PATCH — an `is_active`-only body toggles the rule (409 when already in that
 * state); any other body is a field edit. Edits affect FUTURE awards only.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  const id = ruleId(params.id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 1 && keys[0] === "is_active") {
    const rule = await setEarningRuleActive(me, id, Boolean(body.is_active));
    return json(serializeRewardEarningRule(rule));
  }
  const rule = await updateEarningRule(me, id, parseRuleBody(body));
  return json(serializeRewardEarningRule(rule));
});

/** DELETE — removes an unused rule, archives one the ledger still references. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const params = await ctx.params;
  const result = await deleteEarningRule(me, ruleId(params.id));
  return json({
    archived: result.archived,
    ledger_entries: result.ledgerEntries,
    rule: serializeRewardEarningRule(result.rule),
  });
});
