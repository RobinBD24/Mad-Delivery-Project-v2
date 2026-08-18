import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import {
  DEFAULT_RIDER_COMMISSION,
  SETTING_KEYS,
  riderCommissionRate,
  setSetting,
} from "@/lib/services/settings";

// GET /api/admin/settings/delivery-fees — current per-delivery rider commission.
export const GET = handle(async () => {
  await requireApiRole("super_admin");
  const rate = await riderCommissionRate();
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEYS.riderCommissionPerDelivery },
    include: { updatedBy: true },
  });
  return json({
    commission_per_delivery: rate.toFixed(2),
    default: DEFAULT_RIDER_COMMISSION,
    updated_at: row?.updatedAt.toISOString() ?? null,
    updated_by_name: row?.updatedBy
      ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}`.trim() || row.updatedBy.username
      : null,
  });
});

// PUT /api/admin/settings/delivery-fees  { commission_per_delivery }
export const PUT = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin");
  const body = (await req.json().catch(() => ({}))) as { commission_per_delivery?: string | number };
  const value = Number(body.commission_per_delivery);
  if (body.commission_per_delivery === undefined || Number.isNaN(value) || value < 0 || value > 100000) {
    throw validationError({ commission_per_delivery: sk("errors.money.enterValidCommission") });
  }

  await setSetting(SETTING_KEYS.riderCommissionPerDelivery, value.toFixed(2), me.id);
  await prisma.financialAuditLog.create({
    data: {
      actorId: me.id,
      action: "setting_updated",
      entity: "SystemSetting",
      entityId: SETTING_KEYS.riderCommissionPerDelivery,
      detail: `৳${value.toFixed(2)} per delivery`,
    },
  });
  return json({ commission_per_delivery: value.toFixed(2) });
});
