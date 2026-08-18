import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, ViewAllLink } from "@/components/ui/card";
import { RankedList } from "@/components/dashboard/ranked-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { accountsDashboard } from "@/lib/services/dashboards";
import type { AccountsDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("accounts.title") };
}

export default async function AccountsDashboardPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts");
  const data = (await accountsDashboard()) as AccountsDashboard;
  // Share of finished orders that were delivered rather than cancelled.
  const finished = data.delivered_orders + data.cancelled_orders;
  const rate = finished ? Math.round((data.delivered_orders / finished) * 100) : 0;

  return (
    <>
      <PageHeader title={t("accounts.title")} subtitle={t("accounts.subtitle")} />
      {/* Compact stat strip (mockup .chip-row) */}
      <ChipRow>
        <StatChip label={t("accounts.deliveredOrders")} value={fmt.num(data.delivered_orders)} icon={<Icon name="check" className="size-4.5" />} accent="green" />
        <StatChip label={t("accounts.cancelledOrders")} value={fmt.num(data.cancelled_orders)} icon={<Icon name="x" className="size-4.5" />} accent="red" />
        <StatChip label={t("accounts.branchesReporting")} value={fmt.num(data.sales_by_branch.length)} icon={<Icon name="store" className="size-4.5" />} accent="violet" />
        <StatChip label={t("accounts.paymentMethods")} value={fmt.num(data.sales_by_payment.length)} icon={<Icon name="wallet" className="size-4.5" />} accent="blue" />
        <StatChip label={t("accounts.totalSalesDelivered")} value={fmt.money(data.total_sales)} icon={<Icon name="money" className="size-4.5" />} accent="teal" mono />
        <StatChip
          label={t("accounts.fulfilmentRate")}
          value={`${fmt.num(rate)}%`}
          icon={<Icon name="chart" className="size-4.5" />}
          accent="brand"
        />
      </ChipRow>

      {/* Main metric cards (mockup .kpi-row) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("accounts.totalSalesDelivered")} value={fmt.money(data.total_sales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("accounts.deliveredOrders")} value={fmt.num(data.delivered_orders)} icon={<Icon name="check" />} accent="blue" />
        <StatCard label={t("accounts.cancelledOrders")} value={fmt.num(data.cancelled_orders)} icon={<Icon name="x" />} accent="red" />
        <StatCard
          label={t("accounts.fulfilmentRate")}
          value={`${fmt.num(rate)}%`}
          icon={<Icon name="chart" />}
          accent="violet"
          progress={rate}
        />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("accounts.salesByBranch")} action={<ViewAllLink href="/accounts/sales">{t("common.viewAll")}</ViewAllLink>} />
          {data.sales_by_branch.length === 0 ? (
            <EmptyState title={t("accounts.noSalesYet")} />
          ) : (
            <Table headers={[t("accounts.colBranch"), t("accounts.colOrders"), t("accounts.colSales")]}>
              {data.sales_by_branch.map((row) => (
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
          <CardHeader title={t("accounts.salesByPayment")} action={<ViewAllLink href="/accounts/payments">{t("common.viewAll")}</ViewAllLink>} />
          <CardContent>
            <RankedList
              emptyTitle={t("accounts.noSalesYet")}
              items={[...data.sales_by_payment]
                .sort((a, b) => Number(b.sales) - Number(a.sales))
                .map((row) => ({
                  key: row.payment_method,
                  title: t(`payment.${row.payment_method}`),
                  meta: `${fmt.num(row.orders)} ${t("accounts.colOrders")}`,
                  value: fmt.money(row.sales),
                  visual: <Icon name="wallet" className="size-4" />,
                }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
