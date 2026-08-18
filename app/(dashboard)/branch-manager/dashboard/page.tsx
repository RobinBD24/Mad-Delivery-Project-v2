import type { Metadata } from "next";

import { WeeklySalesChart } from "@/components/dashboard/bar-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { LiveOperationsBoard } from "@/components/branch/live-operations-board";
import { OrderTable } from "@/components/orders/order-table";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, PeriodPill, ViewAllLink } from "@/components/ui/card";
import { RankedList } from "@/components/dashboard/ranked-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { branchManagerDashboard } from "@/lib/services/dashboards";
import type { BranchManagerDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("branchManager.dashboardTitle") };
}


export default async function BranchManagerDashboardPage() {
  const { t, fmt, locale } = await getT();
  const me = await requireRole("branch_manager");
  const data = (await branchManagerDashboard(me)) as BranchManagerDashboard;

  if (!data.branch) {
    return (
      <>
        <PageHeader title={t("branchManager.dashboardTitle")} />
        <Card>
          <EmptyState
            title={t("branchManager.noBranchTitle")}
            description={t("branchManager.noBranchDesc")}
          />
        </Card>
      </>
    );
  }

  const today = data.today!;
  const breakdown = today.status_breakdown;
  const riders = data.riders ?? { total: 0, on_duty: 0, off_duty: 0 };
  const pending = breakdown.pending + breakdown.accepted;

  return (
    <>
      <PageHeader
        title={data.branch.name}
        subtitle={data.branch.address}
        action={
          <span className="flex gap-2">
            <ButtonLink href="/branch-manager/catalog" variant="outline">
              {t("nav.catalog")}
            </ButtonLink>
            <ButtonLink href="/branch-manager/orders">{t("branchManager.ordersArrow")}</ButtonLink>
          </span>
        }
      />

      {/* PHASE I/D — live operational board. Polls a small JSON snapshot every
          2 seconds and swaps the numbers in place; the page is never reloaded. */}
      <Card className="mb-4.5">
        <CardHeader title={t("bmLive.title")} subtitle={t("bmLive.subtitle")} />
        <CardContent>
          <LiveOperationsBoard />
        </CardContent>
      </Card>

      {/* req #5 — the manager's assigned branch identity: name + brand type (from
          the Branch.brandType column) + status. Server-resolved from the session. */}
      <Card className="mb-4.5">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("branchInfo.branchName")}</p>
            <p className="mt-0.5 truncate font-semibold text-fg-base" data-testid="bm-branch-name">{data.branch.name}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("branchInfo.branchType")}</p>
            <p className="mt-0.5" data-testid="bm-branch-type">
              <Badge tone="blue">{t(`brands.${data.branch.brand_type ?? "combined"}`)}</Badge>
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("common.status")}</p>
            <p className="mt-0.5" data-testid="bm-branch-status">
              {data.branch.is_archived ? (
                <Badge tone="red">{t("branchInfo.archived")}</Badge>
              ) : data.branch.is_active ? (
                <Badge tone="green">{t("common.active")}</Badge>
              ) : (
                <Badge tone="red">{t("common.inactive")}</Badge>
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("branchInfo.deliveryAreas")}</p>
            <p className="mt-0.5 font-semibold text-fg-base" data-testid="bm-branch-areas">
              {fmt.num(data.branch.delivery_area_count ?? 0)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("branchSettings.radius")}</p>
            <p className="mt-0.5 font-semibold text-fg-base" data-testid="bm-branch-radius">
              {fmt.num(data.branch.delivery_radius_km ?? 0)} {t("branchSettings.km")}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("branchSettings.fee")}</p>
            <p className="mt-0.5 font-semibold text-fg-base" data-testid="bm-branch-fee">
              {fmt.money(data.branch.delivery_fee ?? 0)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Compact stat strip — the mockup's own .chip-row, 1:1 */}
      <ChipRow>
        <StatChip label={t("branchManager.kpiTotalProducts")} value={fmt.num(data.total_products ?? 0)} icon={<Icon name="grid" className="size-4.5" />} accent="brand" />
        <StatChip label={t("branchManager.kpiRidersOnDuty")} value={fmt.num(riders.on_duty)} icon={<Icon name="bike" className="size-4.5" />} accent="green" />
        <StatChip label={t("branchManager.kpiCancelledOrders")} value={fmt.num(breakdown.cancelled)} icon={<Icon name="x" className="size-4.5" />} accent="red" />
        <StatChip label={t("branchManager.cardTodayOrders")} value={fmt.num(today.total_orders)} icon={<Icon name="list" className="size-4.5" />} accent="violet" />
        <StatChip label={t("branchManager.cardTodayIncome")} value={fmt.money(today.sales)} icon={<Icon name="money" className="size-4.5" />} accent="teal" mono />
        <StatChip label={t("branchManager.kpiReady")} value={fmt.num(breakdown.ready)} icon={<Icon name="check" className="size-4.5" />} accent="blue" />
      </ChipRow>

      {/* Main metric cards (mockup .kpi-row) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("branchManager.cardTodayOrders")} value={fmt.num(today.total_orders)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("branchManager.cardTodayIncome")} value={fmt.money(today.sales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("branchManager.cardPendingOrders")} value={fmt.num(pending)} icon={<Icon name="clock" />} accent="amber" />
        <StatCard
          label={t("branchManager.cardActiveRiders")}
          value={`${fmt.num(riders.on_duty)} / ${fmt.num(riders.total)}`}
          icon={<Icon name="bike" />}
          accent="blue"
          sub={t("branchManager.ridersOffDuty", { count: fmt.num(riders.off_duty) })}
          progress={riders.total ? (riders.on_duty / riders.total) * 100 : 0}
        />
      </div>

      {/* Weekly sales + status donut */}
      <div className="grid gap-4.5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title={t("branchManager.weeklySales")} subtitle={t("branchManager.weeklySalesSub")} action={<PeriodPill>{t("dashboard.thisWeek")}</PeriodPill>} />
          <CardContent>
            <WeeklySalesChart data={data.weekly_sales ?? []} locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("branchManager.orderStatusTitle")} subtitle={t("branchManager.todayBreakdown")} />
          <CardContent>
            <DonutChart locale={locale}
              centerLabel={t("branchManager.todayOrdersCenter")}
              slices={[
                { label: t("branchManager.sliceWaiting"), value: breakdown.pending + breakdown.accepted, color: "#f4a261" },
                { label: t("branchManager.slicePreparing"), value: breakdown.preparing + breakdown.ready, color: "#8b5cf6" },
                { label: t("branchManager.sliceDelivering"), value: breakdown.picked_up + breakdown.on_the_way, color: "#3b82f6" },
                { label: t("branchManager.sliceCompleted"), value: breakdown.delivered, color: "#2dc653" },
                { label: t("branchManager.sliceCancelled"), value: breakdown.cancelled, color: "#e63946" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + popular items */}
      <div className="grid gap-4.5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader
            title={t("branchManager.recentOrders")}
            action={<ViewAllLink href="/branch-manager/orders">{t("common.viewAll")}</ViewAllLink>}
          />
          {(data.recent_orders ?? []).length === 0 ? (
            <EmptyState title={t("orders.noOrders")} description={t("orders.noOrdersDesc")} />
          ) : (
            <OrderTable orders={data.recent_orders!} hrefBase="/branch-manager/orders" />
          )}
        </Card>

        <Card>
          <CardHeader
            title={t("branchManager.popularItems")}
            action={<ViewAllLink href="/branch-manager/catalog">{t("common.viewAll")}</ViewAllLink>}
          />
          <CardContent>
            <RankedList
              emptyTitle={t("branchManager.noOrderData")}
              items={(data.popular_items ?? []).map((item) => ({
                key: item.product__id,
                title: item.product__name,
                meta: t("branchManager.orderedTimes", { count: fmt.num(item.order_count) }),
                value: fmt.money(item.revenue),
                visual: <Icon name="grid" className="size-4" />,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
