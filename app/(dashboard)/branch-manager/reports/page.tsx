import type { Metadata } from "next";

import { WeeklySalesChart } from "@/components/dashboard/bar-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { branchManagerDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { BranchManagerDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.reports") };
}

/** /branch-manager/reports — own-branch sales, status breakdown and popular items. */
export default async function BranchManagerReportsPage() {
  const { t, fmt, locale } = await getT();
  const me = await requireRole("branch_manager");
  // Call the service DIRECTLY rather than having this server component fetch
  // its own Route Handler over HTTP. The handler is a thin wrapper around this
  // same function, so the data and the branch scope are identical — but the
  // self-fetch could fail for reasons that have nothing to do with the report
  // (host/origin resolution, or the loopback request failing under load), and
  // any such failure surfaced to the user as "Could not load data".
  const data = (await branchManagerDashboard(me)) as BranchManagerDashboard;

  if (!data.branch) {
    return (
      <>
        <PageHeader title={t("nav.reports")} subtitle={t("branchManager.dashboardTitle")} />
        <Card>
          <EmptyState title={t("branchManager.noBranchTitle")} description={t("branchManager.noBranchDesc")} />
        </Card>
      </>
    );
  }

  const b = data.today?.status_breakdown ?? {
    pending: 0, accepted: 0, preparing: 0, ready: 0, picked_up: 0, on_the_way: 0, delivered: 0, cancelled: 0,
  };

  return (
    <>
      <PageHeader title={t("nav.reports")} subtitle={data.branch.name} />
      <SummaryCardGrid className="mb-6">
        <SummaryCard
          title={t("branchManager.cardTodayOrders")}
          value={data.today ? fmt.num(data.today.total_orders) : "—"}
          icon={<Icon name="bag" />}
          href="/branch-manager/orders"
        />
        <SummaryCard
          title={t("branchManager.cardTodayIncome")}
          value={data.today ? fmt.money(data.today.sales) : "—"}
          icon={<Icon name="money" />}
          accent="success"
        />
        <SummaryCard
          title={t("branchManager.cardActiveRiders")}
          value={data.riders ? fmt.num(data.riders.on_duty) : "—"}
          icon={<Icon name="bike" />}
          accent="info"
          href="/branch-manager/riders"
        />
        <SummaryCard
          title={t("branchManager.kpiTotalProducts")}
          value={data.total_products == null ? "—" : fmt.num(data.total_products)}
          icon={<Icon name="list" />}
          accent="violet"
          href="/branch-manager/catalog"
        />
      </SummaryCardGrid>
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title={t("branchManager.weeklySales")} subtitle={t("branchManager.weeklySalesSub")} />
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
                { label: t("branchManager.sliceWaiting"), value: b.pending + b.accepted, color: "#f4a261" },
                { label: t("branchManager.slicePreparing"), value: b.preparing + b.ready, color: "#8b5cf6" },
                { label: t("branchManager.sliceDelivering"), value: b.picked_up + b.on_the_way, color: "#3b82f6" },
                { label: t("branchManager.sliceCompleted"), value: b.delivered, color: "#2dc653" },
                { label: t("branchManager.sliceCancelled"), value: b.cancelled, color: "#e63946" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("branchManager.popularItems")} />
        {(data.popular_items ?? []).length === 0 ? (
          <EmptyState title={t("branchManager.noOrderData")} />
        ) : (
          <Table headers={[t("pages.colProduct"), t("pages.colOrders"), t("pages.colRevenue")]}>
            {data.popular_items!.map((item) => (
              <tr key={item.product__id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{item.product__name}</span></Td>
                <Td>{fmt.num(item.order_count)}</Td>
                <Td><span className="font-semibold">{fmt.money(item.revenue)}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
