import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

function Bar({ label, pct, display, color }: { label: string; pct: number; display: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <p className="w-28 shrink-0 text-xs text-fg-muted">{label}</p>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
      </div>
      <p className="w-11 shrink-0 text-right text-xs font-extrabold" style={{ color }}>
        {display}
      </p>
    </div>
  );
}

/**
 * Design's "My Performance" panel — progress bars from REAL derived metrics
 * only (completion rate over lifetime orders, average customer rating).
 * No invented acceptance/on-time figures: those aren't tracked yet.
 */
export async function RiderPerformanceCard({ data }: { data: RiderDashboard }) {
  const { t, fmt } = await getT();
  const finished = data.total_delivered + data.cancelled_total;
  const completion = finished === 0 ? null : Math.round((data.total_delivered / finished) * 100);
  const ratingPct = data.avg_rating === null ? null : Math.round((data.avg_rating / 5) * 100);

  return (
    <Card>
      <CardHeader title={t("rider.performance")} />
      <CardContent className="space-y-3">
        {completion !== null ? (
          <Bar label={t("rider.completionRate")} pct={completion} display={`${fmt.num(completion)}%`} color="#16a34a" />
        ) : null}
        {ratingPct !== null ? (
          <Bar label={t("rider.customerRating")} pct={ratingPct} display={fmt.num(data.avg_rating ?? 0)} color="#f59e0b" />
        ) : null}
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">{t("rider.totalDelivered")}</span>
          <span className="font-bold text-fg-base">{fmt.num(data.total_delivered)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-muted">{t("rider.daysActive")}</span>
          <span className="font-bold text-fg-base">{fmt.num(data.duty_history.length)}</span>
        </div>

        {completion !== null && completion >= 90 ? (
          <p className="rounded-lg bg-rider-50 px-3 py-2 text-center text-xs font-bold text-rider-700 dark:bg-rider-500/10 dark:text-rider-500">
            {t("rider.greatJob")}
          </p>
        ) : null}

        <Link
          href="/rider/performance"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-muted px-3 py-2 text-center text-xs font-medium text-brand-600 hover:bg-surface-hover"
        >
          {t("rider.viewFullPerformance")} <Icon name="chevron" className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
