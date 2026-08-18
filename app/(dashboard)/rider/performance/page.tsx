import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { daysAgo } from "@/lib/utils/dates";
import { riderTravelDistanceKm } from "@/lib/services/rider-location";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.performanceTitle") };
}

/** /rider/performance — real daily/weekly/monthly delivery & distance stats. */
export default async function RiderPerformancePage() {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const userId = Number(me.id);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const [today, week, month, commissions, ratings, distTotal, distWeek] = await Promise.all([
    prisma.order.count({ where: { riderId: userId, status: "delivered", updatedAt: { gte: startToday } } }),
    prisma.order.count({ where: { riderId: userId, status: "delivered", updatedAt: { gte: daysAgo(7) } } }),
    prisma.order.count({ where: { riderId: userId, status: "delivered", updatedAt: { gte: daysAgo(30) } } }),
    prisma.riderCommission.aggregate({ where: { riderId: userId }, _sum: { amount: true }, _count: true }),
    prisma.riderReview.aggregate({ where: { riderId: userId }, _avg: { rating: true }, _count: true }),
    riderTravelDistanceKm(userId),
    riderTravelDistanceKm(userId, daysAgo(7)),
  ]);

  return (
    <>
      <PageHeader title={t("rider.performanceTitle")} subtitle={t("rider.performanceSub")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label={t("riderLoc.todayDeliveries")} value={fmt.num(today)} icon={<Icon name="bike" />} accent="brand" />
        <StatCard label={t("riderLoc.weekDeliveries")} value={fmt.num(week)} icon={<Icon name="bag" />} accent="blue" />
        <StatCard label={t("riderLoc.monthDeliveries")} value={fmt.num(month)} icon={<Icon name="chart" />} accent="violet" />
        <StatCard label={t("riderLoc.totalDeliveries")} value={fmt.num(commissions._count)} icon={<Icon name="check" />} accent="green" />
        <StatCard label={t("riderLoc.totalEarnings")} value={fmt.money(commissions._sum.amount?.toString() ?? "0")} icon={<Icon name="money" />} accent="amber" />
        <StatCard
          label={t("riderLoc.avgRating")}
          value={ratings._avg.rating ? `${ratings._avg.rating.toFixed(1)} ★` : "—"}
          sub={t("riderLoc.reviewsN", { n: fmt.num(ratings._count) })}
          icon={<Icon name="grid" />}
          accent="slate"
        />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("riderLoc.travelDistance")} />
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t("riderLoc.weekDistance")} value={`${fmt.num(distWeek)} km`} icon={<Icon name="pin" />} accent="brand" />
            <StatCard label={t("riderLoc.totalDistance")} value={`${fmt.num(distTotal)} km`} icon={<Icon name="pin" />} accent="green" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
