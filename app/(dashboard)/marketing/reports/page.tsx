import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { marketingDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { MarketingDashboard } from "@/types";

export const metadata: Metadata = { title: "Reports" };

/** /marketing/reports — product & category performance report. */
export default async function MarketingReportsPage() {
  await requireRole("marketing");
  const { t, fmt } = await getT();
  const data = (await marketingDashboard()) as MarketingDashboard;

  return (
    <>
      <PageHeader title={t("pages.reportsTitle")} subtitle={t("pages.reportsSub")} />
      <SummaryCardGrid className="mb-6">
        <SummaryCard title={t("marketing.totalCustomers")} value={fmt.num(data.total_customers)} icon={<Icon name="users" />} />
        <SummaryCard title={t("marketing.newCustomers30d")} value={fmt.num(data.new_customers_30d)} icon={<Icon name="user" />} accent="success" />
        <SummaryCard title={t("marketing.totalOrders")} value={fmt.num(data.total_orders)} icon={<Icon name="bag" />} accent="info" />
        <SummaryCard title={t("marketing.activeBranches")} value={fmt.num(data.active_branches)} icon={<Icon name="store" />} accent="violet" />
      </SummaryCardGrid>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("pages.popularProducts")} />
          {data.popular_products.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colProduct"), t("pages.colOrders"), t("pages.colRevenue")]}>
              {data.popular_products.map((row) => (
                <tr key={row.product__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.product__name}</span></Td>
                  <Td>{fmt.num(row.order_count)}</Td>
                  <Td><span className="font-semibold">{fmt.money(row.revenue)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("pages.topCategories")} />
          {data.top_categories.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colCategory"), t("pages.colOrders"), t("pages.colQty")]}>
              {data.top_categories.map((row) => (
                <tr key={row.product__category__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.product__category__name}</span></Td>
                  <Td>{fmt.num(row.order_count)}</Td>
                  <Td>{fmt.num(row.quantity)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
