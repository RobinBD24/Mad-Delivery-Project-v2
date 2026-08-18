import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { json, noContent } from "@/lib/http/respond";
import { serializeVariation } from "@/lib/serializers";
import { deleteVariation, setVariationDefault, setVariationEnabled } from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/product-variations/[id] — independent enable/disable or set-default.
// Body: { is_enabled?: boolean } and/or { is_default?: true }. Branch scope +
// the ≥1-enabled / single-default invariants are enforced in the service.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const { fields, has } = await parseBody(req);
  const variationId = Number(id);

  let result = null;
  if (has("is_enabled")) {
    result = await setVariationEnabled(me, variationId, fields.is_enabled === "true");
  }
  if (fields.is_default === "true") {
    result = await setVariationDefault(me, variationId);
  }
  return json(result ? serializeVariation(result) : { ok: true });
});

// DELETE /api/product-variations/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await deleteVariation(me, Number(id));
  return noContent();
});
