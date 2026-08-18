import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeBranch } from "@/lib/serializers";
import { updateBranchPaymentSettings } from "@/lib/services/payments";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/branches/[id]/payment-settings — PHASE S.
// Super admin may configure any branch; a branch manager only their own.
// bKash cannot be enabled without a valid destination number.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    bkash_enabled?: unknown;
    bkash_number?: unknown;
    bkash_instructions?: unknown;
  };
  const updated = await updateBranchPaymentSettings(me, Number(id), {
    ...(body.bkash_enabled !== undefined ? { bkashEnabled: body.bkash_enabled } : {}),
    ...(body.bkash_number !== undefined ? { bkashNumber: body.bkash_number } : {}),
    ...(body.bkash_instructions !== undefined ? { bkashInstructions: body.bkash_instructions } : {}),
  });
  return json(serializeBranch(updated));
});
