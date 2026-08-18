import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { resolveManageableBranch } from "@/lib/services/branch-ops";
import { getConfig, saveConfig, serializeConfig } from "@/lib/services/ramadan";

// GET /api/ramadan/config?branch_id= — BM own branch / SA any.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const branch = await resolveManageableBranch(me, branchId ? Number(branchId) : undefined);
  return json(serializeConfig(await getConfig(branch.id), branch.id));
});

// PATCH /api/ramadan/config — save configuration.
export const PATCH = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await saveConfig(me, {
    branchId: body.branch_id != null ? Number(body.branch_id) : undefined,
    isEnabled: body.is_enabled != null ? Boolean(body.is_enabled) : undefined,
    bookingStartDate: body.booking_start_date != null ? String(body.booking_start_date) : undefined,
    bookingEndDate: body.booking_end_date != null ? String(body.booking_end_date) : undefined,
    advanceType: body.advance_type != null ? String(body.advance_type) : undefined,
    advanceValue: body.advance_value != null ? Number(body.advance_value) : undefined,
    advanceGuestThreshold: body.advance_guest_threshold != null ? Number(body.advance_guest_threshold) : undefined,
    paymentDeadlineHours: body.payment_deadline_hours != null ? Number(body.payment_deadline_hours) : undefined,
    cancellationPolicy: body.cancellation_policy != null ? String(body.cancellation_policy) : undefined,
  });
  return json(serializeConfig(config, config.branchId));
});
