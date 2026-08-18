import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DeliveryFeeForm } from "@/components/wallet/delivery-fee-form";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated, RiderEarningRowT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("wallet.feeTitle") };
}

interface FeePayload {
  commission_per_delivery: string;
  updated_at: string | null;
  updated_by_name: string | null;
}

/** /admin/settings/delivery-fees — set the per-delivery rider commission. */
export default async function DeliveryFeesPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  const [fee, earnings] = await Promise.all([
    getJSON<FeePayload>("/admin/settings/delivery-fees/"),
    getJSON<Paginated<RiderEarningRowT>>("/accounts/rider-earnings/"),
  ]);

  const totalPaid = earnings.results.reduce((acc, r) => acc + Number(r.paid_amount), 0);
  const totalOwed = earnings.results.reduce((acc, r) => acc + Number(r.available_balance), 0);
  const totalDeliveries = earnings.results.reduce((acc, r) => acc + r.deliveries, 0);

  return (
    <>
      <PageHeader title={t("wallet.feeTitle")} subtitle={t("wallet.feeSub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("wallet.currentRate")}
          value={fmt.money(fee.commission_per_delivery)}
          sub={fee.updated_by_name ? `${fee.updated_by_name} · ${fmt.dateTime(fee.updated_at)}` : undefined}
          icon={<Icon name="money" />}
          accent="brand"
        />
        <StatCard label={t("wallet.commissionedDeliveries")} value={fmt.num(totalDeliveries)} icon={<Icon name="bike" />} accent="blue" />
        <StatCard label={t("wallet.totalOwedRiders")} value={fmt.money(totalOwed)} sub={t("wallet.paidSoFar", { amount: fmt.money(totalPaid) })} icon={<Icon name="clock" />} accent="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("wallet.setRate")} subtitle={t("wallet.setRateSub")} />
          <CardContent>
            <DeliveryFeeForm current={fee.commission_per_delivery} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("wallet.riderSummary")} />
          <CardContent className="p-0">
            {earnings.results.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-muted">{t("pages.noData")}</p>
            ) : (
              <ul className="divide-y divide-border-base">
                {earnings.results.map((r) => (
                  <li key={r.rider} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-fg-base">{r.rider_name}</p>
                      <p className="text-xs text-fg-subtle">
                        {r.branch_name ?? "—"} · {t("wallet.deliveriesN", { count: fmt.num(r.deliveries) })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-fg-base">{fmt.money(r.total_earnings)}</p>
                      <p className="text-xs text-emerald-600">
                        {t("wallet.availableShort")}: {fmt.money(r.available_balance)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
