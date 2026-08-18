import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Table, Td } from "@/components/ui/table";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { superAdminDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { OrderStatus, SuperAdminDashboard } from "@/types";

export const metadata: Metadata = { title: "Reports" };

/** /admin/reports — system-wide performance report (real dashboard aggregates). */
export default async function AdminReportsPage() {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const data = (await superAdminDashboard()) as SuperAdminDashboard;

  return (
    <>
      <PageHeader
        title={t("pages.reportsTitle")}
        subtitle={t("pages.reportsSub")}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/reports/sales" variant="outline" size="sm">
              {t("adminReports.salesTitle")}
            </ButtonLink>
            <ButtonLink href="/admin/reports/orders" variant="outline" size="sm">
              {t("adminReports.ordersTitle")}
            </ButtonLink>
            <ButtonLink href="/admin/reports/cancelled-orders" variant="outline" size="sm">
              {t("adminReports.cancelledTitle")}
            </ButtonLink>
            <ButtonLink href="/admin/reports/attendance" variant="outline" size="sm">
              {t("adminReports.attendanceTitle")}
            </ButtonLink>
          </div>
        }
      />

      <SummaryCardGrid>
        <SummaryCard title={t("pages.totalOrders")} value={fmt.num(data.orders.total)} icon={<Icon name="bag" />} accent="brand" />
        <SummaryCard title={t("superAdmin.totalSales")} value={fmt.money(data.orders.total_sales)} icon={<Icon name="money" />} accent="success" />
        <SummaryCard title={t("pages.activeBranches")} value={fmt.num(data.branches.active)} icon={<Icon name="store" />} accent="info" />
        <SummaryCard title={t("pages.totalCustomers")} value={fmt.num(data.users.customers)} icon={<Icon name="users" />} accent="violet" />
      </SummaryCardGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("pages.branchPerformance")} />
          {data.branch_performance.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colBranch"), t("pages.colOrders"), t("pages.colSales")]}>
              {data.branch_performance.map((row) => (
                <tr key={row.branch__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.branch__name}</span></Td>
                  <Td>{fmt.num(row.orders)}</Td>
                  <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("pages.orderStatusBreakdown")} />
          <div className="grid grid-cols-2 gap-3 p-5">
            {(Object.entries(data.orders.status_breakdown) as [OrderStatus, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl border border-border-base/80 px-4 py-3">
                <span className="text-sm text-fg-muted">{t(`orderStatus.${status}`)}</span>
                <span className="font-semibold text-fg-base">{fmt.num(count)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
