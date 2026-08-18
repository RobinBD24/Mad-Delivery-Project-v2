import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { OnlineTracker } from "@/components/rider/online-tracker";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { midnight } from "@/lib/utils/dates";
import { riderTravelDistanceKm } from "@/lib/services/rider-location";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("riderLoc.locationHistoryTitle") };
}

/** /rider/location-history — online toggle + recent visited locations. */
export default async function RiderLocationHistoryPage() {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const userId = Number(me.id);

  const [profile, points, totalKm, todayKm] = await Promise.all([
    prisma.riderProfile.findUnique({ where: { userId } }),
    prisma.riderRoutePoint.findMany({ where: { riderId: userId }, orderBy: { recordedAt: "desc" }, take: 100 }),
    riderTravelDistanceKm(userId),
    riderTravelDistanceKm(userId, midnight()),
  ]);

  return (
    <>
      <PageHeader title={t("riderLoc.locationHistoryTitle")} subtitle={t("riderLoc.locationHistorySub")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("riderLoc.dutyStatus")} />
          <CardContent className="space-y-4">
            <OnlineTracker initialOnline={profile?.isOnline ?? false} />
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t("riderLoc.todayDistance")} value={`${fmt.num(todayKm)} km`} icon={<Icon name="pin" />} accent="brand" />
              <StatCard label={t("riderLoc.totalDistance")} value={`${fmt.num(totalKm)} km`} icon={<Icon name="bike" />} accent="green" />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("riderLoc.visitedLocations")} />
          {points.length === 0 ? (
            <EmptyState title={t("riderLoc.noPoints")} description={t("riderLoc.noPointsDesc")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("riderLoc.latitude"), t("riderLoc.longitude")]}>
              {points.map((p) => (
                <tr key={p.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(p.recordedAt.toISOString())}</span></Td>
                  <Td>{fmt.num(Number(p.lat).toFixed(5))}</Td>
                  <Td>{fmt.num(Number(p.lng).toFixed(5))}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
