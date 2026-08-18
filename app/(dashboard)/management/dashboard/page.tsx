import type { Metadata } from "next";

import { WeeklySalesChart } from "@/components/dashboard/bar-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, PeriodPill, ViewAllLink } from "@/components/ui/card";
import { RankedList } from "@/components/dashboard/ranked-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { managementDashboard } from "@/lib/services/dashboards";
import type { ManagementDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("management.title") };
}

export default async function ManagementDashboardPage() {
  const { t, fmt, locale } = await getT();
  await requireRole("management");
  const data = (await managementDashboard()) as ManagementDashboard;
  const b = data.status_breakdown;

  return (
    <>
      <PageHeader title={t("management.title")} subtitle={t("management.subtitle")} />

      {/* Compact stat strip (mockup .chip-row) */}
      <ChipRow>
        <StatChip label={t("management.totalUsers")} value={fmt.num(data.total_users)} icon={<Icon name="users" className="size-4.5" />} accent="blue" />
        <StatChip label={t("management.activeCustomers")} value={fmt.num(data.total_customers)} icon={<Icon name="user" className="size-4.5" />} accent="green" />
        <StatChip label={t("management.activeRiders")} value={fmt.num(data.total_riders)} icon={<Icon name="bike" className="size-4.5" />} accent="violet" />
        <StatChip label={t("management.activeBranches")} value={fmt.num(data.active_branches)} icon={<Icon name="store" className="size-4.5" />} accent="amber" />
        <StatChip label={t("management.pendingUsers")} value={fmt.num(data.pending_users)} icon={<Icon name="clock" className="size-4.5" />} accent="amber" />
        <StatChip label={t("management.deliveredOrders")} value={fmt.num(data.delivered_orders)} icon={<Icon name="check" className="size-4.5" />} accent="teal" />
      </ChipRow>

      {/* Main metric cards (mockup .kpi-row) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("management.todayOrders")} value={fmt.num(data.today_orders)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("management.todaySales")} value={fmt.money(data.today_sales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("management.totalOrders")} value={fmt.num(data.total_orders)} icon={<Icon name="cart" />} accent="blue" />
        <StatCard
          label={t("management.totalSales")}
          value={fmt.money(data.total_sales)}
          icon={<Icon name="chart" />}
          accent="violet"
          progress={data.total_orders ? (data.delivered_orders / data.total_orders) * 100 : 0}
          sub={t("management.deliveredOfTotal", { delivered: fmt.num(data.delivered_orders), total: fmt.num(data.total_orders) })}
        />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title={t("management.weeklySales")} subtitle={t("management.weeklySalesSubtitle")} action={<PeriodPill>{t("dashboard.thisWeek")}</PeriodPill>} />
          <CardContent>
            <WeeklySalesChart data={data.weekly_sales} locale={locale} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("management.orderStatus")} subtitle={t("management.orderStatusSubtitle")} />
          <CardContent>
            <DonutChart locale={locale}
              centerLabel={t("management.totalOrders")}
              slices={[
                { label: t("management.statusPending"), value: b.pending + b.accepted, color: "#f4a261" },
                { label: t("management.statusPreparing"), value: b.preparing + b.ready, color: "#8b5cf6" },
                { label: t("management.statusDelivering"), value: b.picked_up + b.on_the_way, color: "#3b82f6" },
                { label: t("management.statusCompleted"), value: b.delivered, color: "#2dc653" },
                { label: t("management.statusCancelled"), value: b.cancelled, color: "#e63946" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("management.branchPerformance")} subtitle={t("management.branchPerformanceSubtitle")} action={<ViewAllLink href="/management/branches">{t("common.viewAll")}</ViewAllLink>} />
          {data.branch_performance.length === 0 ? (
            <EmptyState title={t("management.noSalesYet")} />
          ) : (
            <Table headers={[t("management.colBranch"), t("management.colOrders"), t("management.colSales")]}>
              {data.branch_performance.map((row) => (
                <tr key={row.branch__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.branch__name}</span></Td>
                  <Td mono>{fmt.num(row.orders)}</Td>
                  <Td mono><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("management.topRiders")} subtitle={t("management.topRidersSubtitle")} action={<ViewAllLink href="/management/performance">{t("common.viewAll")}</ViewAllLink>} />
          <CardContent>
            <RankedList
              emptyTitle={t("management.noDeliveriesYet")}
              items={data.top_riders.map((row) => ({
                key: row.rider__id,
                title: `${row.rider__first_name} ${row.rider__last_name}`.trim() || row.rider__username,
                meta: `${fmt.num(row.deliveries)} ${t("management.colDeliveries")}`,
                value: fmt.money(row.sales),
                visual: <Icon name="bike" className="size-4" />,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
