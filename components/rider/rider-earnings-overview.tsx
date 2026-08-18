import { WeeklySalesChart } from "@/components/dashboard/bar-chart";
import { Card, CardContent, CardHeader, ViewAllLink } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

/**
 * Earnings overview (design's "Earnings Overview" panel): real weekly
 * commission total + per-day ৳ bar chart from the rider's own ledger.
 */
export async function RiderEarningsOverview({ data }: { data: RiderDashboard }) {
  const { t, fmt, locale } = await getT();
  const weekDeliveries = data.weekly_deliveries.reduce((s, d) => s + d.total, 0);

  return (
    <Card>
      <CardHeader
        title={t("rider.earningsOverview")}
        action={<ViewAllLink href="/rider/earnings">{t("common.viewAll")}</ViewAllLink>}
      />
      <CardContent>
        <p className="text-xs text-fg-subtle">{t("rider.thisWeek")}</p>
        <p className="font-heading text-2xl font-extrabold tracking-[-0.3px] text-fg-base">
          {fmt.money(data.earnings_week)}
        </p>
        <p className="mb-2 mt-1 text-xs text-fg-muted">
          {t("rider.weeklyDeliveries")}: <b>{fmt.num(weekDeliveries)}</b>
        </p>
        <WeeklySalesChart data={data.weekly_earnings} format="money" locale={locale} />
      </CardContent>
    </Card>
  );
}
