import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { riderTravelDistanceKm } from "@/lib/services/rider-location";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("riderLoc.routeHistoryTitle") };
}

/** /rider/route-history — duty routes grouped by day with per-day distance. */
export default async function RiderRouteHistoryPage() {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const userId = Number(me.id);

  const points = await prisma.riderRoutePoint.findMany({
    where: { riderId: userId },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, recordedAt: true },
  });
  const totalKm = await riderTravelDistanceKm(userId);

  // Group by day.
  const byDay = new Map<string, { count: number; first: Date; last: Date }>();
  for (const p of points) {
    const k = p.recordedAt.toISOString().slice(0, 10);
    const g = byDay.get(k) ?? { count: 0, first: p.recordedAt, last: p.recordedAt };
    g.count += 1;
    g.last = p.recordedAt;
    byDay.set(k, g);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1));

  return (
    <>
      <PageHeader title={t("riderLoc.routeHistoryTitle")} subtitle={t("riderLoc.routeHistorySub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("riderLoc.totalDistance")} value={`${fmt.num(totalKm)} km`} icon={<Icon name="bike" />} accent="green" />
        <StatCard label={t("riderLoc.dutyDays")} value={fmt.num(days.length)} icon={<Icon name="clock" />} accent="brand" />
        <StatCard label={t("riderLoc.totalPoints")} value={fmt.num(points.length)} icon={<Icon name="pin" />} accent="violet" />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("riderLoc.dailyRoutes")} />
        {days.length === 0 ? (
          <EmptyState title={t("riderLoc.noRoutes")} description={t("riderLoc.noRoutesDesc")} />
        ) : (
          <CardContent className="p-0">
            <ul className="divide-y divide-border-base">
              {days.map(([date, g]) => (
                <li key={date} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="font-medium text-fg-base">{fmt.date(date)}</p>
                    <p className="text-xs text-fg-subtle">
                      {fmt.time(g.first.toISOString())} – {fmt.time(g.last.toISOString())}
                    </p>
                  </div>
                  <span className="text-sm text-fg-muted">{t("riderLoc.pointsN", { n: fmt.num(g.count) })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </>
  );
}
