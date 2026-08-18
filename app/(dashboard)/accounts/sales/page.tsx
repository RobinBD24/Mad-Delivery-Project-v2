import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { accountsDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { AccountsDashboard } from "@/types";

export const metadata: Metadata = { title: "Sales" };

/** /accounts/sales — branch-wise sales breakdown for finance. */
export default async function AccountsSalesPage() {
  await requireRole("accounts");
  const { t, fmt } = await getT();
  const data = (await accountsDashboard()) as AccountsDashboard;

  return (
    <>
      <PageHeader title={t("pages.salesTitle")} subtitle={t("pages.salesSub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("accounts.totalSalesDelivered")} value={fmt.money(data.total_sales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("accounts.deliveredOrders")} value={fmt.num(data.delivered_orders)} icon={<Icon name="check" />} accent="blue" />
        <StatCard label={t("accounts.cancelledOrders")} value={fmt.num(data.cancelled_orders)} icon={<Icon name="x" />} accent="slate" />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("accounts.salesByBranch")} />
        {data.sales_by_branch.length === 0 ? (
          <EmptyState title={t("accounts.noSalesYet")} />
        ) : (
          <Table headers={[t("accounts.colBranch"), t("accounts.colOrders"), t("accounts.colSales")]}>
            {data.sales_by_branch.map((row) => (
              <tr key={row.branch__id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{row.branch__name}</span></Td>
                <Td>{fmt.num(row.orders)}</Td>
                <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
