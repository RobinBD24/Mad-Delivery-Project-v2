import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { RiderCurrentOrder } from "@/components/rider/rider-current-order";
import { RiderDashboardStats } from "@/components/rider/rider-dashboard-stats";
import { RiderDeliveryMap } from "@/components/rider/rider-delivery-map";
import { RiderEarningsOverview } from "@/components/rider/rider-earnings-overview";
import { RiderNotificationPanel } from "@/components/rider/rider-notification-panel";
import { RiderOnlinePanel } from "@/components/rider/rider-online-panel";
import { RiderDutyChat } from "@/components/rider/rider-duty-chat";
import { RiderPendingOrders } from "@/components/rider/rider-pending-orders";
import { RiderPerformanceCard } from "@/components/rider/rider-performance-card";
import { RiderStatusBar } from "@/components/rider/rider-status-bar";
import { RiderWalletCard } from "@/components/rider/rider-wallet-card";
import { DutyControls } from "@/components/riders/duty-controls";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { riderDashboard } from "@/lib/services/dashboards";
import type { Branch, Notification, Paginated, RiderDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.dashboardTitle") };
}

/**
 * Rider dashboard rebuilt against static_design/Rider-Dashbord-offline.html:
 * compact 5-metric strip, online/offline control, then the design's
 * three-column grid (current order | map + pending queue | earnings /
 * performance / wallet / notifications) and the vehicle footer bar.
 * All data is the signed-in rider's own (server-enforced by the APIs).
 */
export default async function RiderDashboardPage() {
  const { t } = await getT();
  const me = await requireRole("rider");

  const [data, branchList, inbox] = await Promise.all([
    riderDashboard(me) as Promise<RiderDashboard>,
    getJSON<Paginated<Branch>>("/branches/?page_size=100"),
    getJSON<Paginated<Notification>>("/notifications/?page_size=4"),
  ]);

  const online = data.is_online;
  const current =
    data.active_orders.find((o) => o.status === "on_the_way" || o.status === "picked_up") ??
    data.active_orders.find((o) => o.status === "ready") ??
    data.active_orders[0];

  return (
    <>
      <PageHeader
        title={t("rider.dashboardTitle")}
        subtitle={data.assigned_branch?.name ?? t("rider.startDutyPrompt")}
      />

      {/* Duty state is always the rider's first operational decision. */}
      <RiderOnlinePanel initialOnline={online} />

      {/* Real personal metrics stay compact and secondary to duty state. */}
      <RiderDashboardStats data={data} />

      {/* Design's dashboard grid: 260px | 1fr | 280px */}
      <div className="grid gap-4.5 xl:grid-cols-[290px_1fr_310px]">
        {/* Left: current order + duty controls */}
        <div className="min-w-0 space-y-4.5">
          <section data-testid="rider-current-order">
            <RiderCurrentOrder orders={data.active_orders} />
          </section>
          <Card>
            <CardHeader title={t("rider.dutyControls")} />
            <CardContent>
              <DutyControls
                todayDuty={data.today_duty}
                assignedBranchId={data.assigned_branch?.id ?? null}
                branches={branchList.results.map((b) => ({
                  id: b.id,
                  name: b.name,
                  address: b.address,
                  phone: b.phone,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* Center: live map (only meaningful with an active delivery) + queue */}
        <div className="min-w-0 space-y-4.5">
          {online && current ? (
            <RiderDeliveryMap
              pickup={current.branch_name ?? data.assigned_branch?.name ?? null}
              dropoff={current.delivery_address ?? null}
            />
          ) : (
            <Card>
              <CardHeader title={t("rider.deliveryMap")} />
              <EmptyState
                title={online ? t("rider.noCurrentOrder") : t("rider.youAreOffline")}
                description={online ? t("rider.noCurrentOrderDesc") : t("rider.offlineMapDesc")}
              />
            </Card>
          )}
          <RiderPendingOrders orders={data.active_orders} online={online} />
        </div>

        {/* Right: earnings / performance / wallet / notifications */}
        <div className="min-w-0 space-y-4.5">
          <RiderEarningsOverview data={data} />
          <RiderPerformanceCard data={data} />
          <RiderWalletCard data={data} />
          <RiderNotificationPanel notifications={inbox.results} />
        </div>
      </div>

      {/* Chat remains easy to reach, but never pushes active delivery below it. */}
      <section data-testid="rider-duty-chat-section">
        <Card>
          <CardHeader title={t("rider.dutyChat")} />
          <CardContent>
            <RiderDutyChat viewerId={Number(me.id)} />
          </CardContent>
        </Card>
      </section>

      {/* Design's footer: vehicle / license / phone / location + live status */}
      <RiderStatusBar data={data} />
    </>
  );
}
