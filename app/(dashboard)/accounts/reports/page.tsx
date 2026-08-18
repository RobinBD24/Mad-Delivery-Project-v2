import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { accountsDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { AccountsDashboard, AccountsReportPeriod } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.reportsTitle") };
}

interface ReportPayload {
  period: string;
  totals: {
    orders: number;
    sales: string;
    commission: string;
    withdrawals_paid: string;
    expenses: string;
    net_after_commission: string;
    net_revenue: string;
  };
  results: AccountsReportPeriod[];
}

type Params = { searchParams: Promise<{ period?: string }> };

const PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;

/** /accounts/reports — period financial summary + branch/payment breakdowns. */
export default async function AccountsReportsPage({ searchParams }: Params) {
  await requireRole("accounts", "super_admin");
  const { t, fmt } = await getT();
  const sp = await searchParams;
  const period = PERIODS.includes(sp.period as (typeof PERIODS)[number]) ? sp.period : "daily";

  const [report, dashboard] = await Promise.all([
    getJSON<ReportPayload>(`/accounts/reports/?period=${period}`),
    accountsDashboard() as Promise<AccountsDashboard>,
  ]);

  const tab = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <>
      <PageHeader title={t("pages.reportsTitle")} subtitle={t("pages.reportsSub")} />

      <SummaryCardGrid className="xl:grid-cols-5">
        <SummaryCard title={t("accounts.totalSalesDelivered")} value={fmt.money(report.totals.sales)} icon={<Icon name="money" />} accent="success" />
        <SummaryCard title={t("wallet.totalCommission")} value={fmt.money(report.totals.commission)} icon={<Icon name="bike" />} accent="warning" />
        <SummaryCard title={t("wallet.paidWithdrawals")} value={fmt.money(report.totals.withdrawals_paid)} icon={<Icon name="check" />} accent="info" />
        <SummaryCard title={t("financials.expensesLabel")} value={fmt.money(report.totals.expenses)} icon={<Icon name="list" />} accent="neutral" />
        <SummaryCard title={t("financials.netRevenue")} value={fmt.money(report.totals.net_revenue)} icon={<Icon name="chart" />} accent="brand" />
      </SummaryCardGrid>

      <Card className="mt-6">
        <CardHeader
          title={t("wallet.periodReport")}
          action={
            <div className="flex items-center gap-1.5 rounded-full bg-surface-muted p-1">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/accounts/reports?period=${p}`}
                  className={cn(tab, period === p ? "bg-surface-card text-brand-600 shadow-sm" : "text-fg-muted")}
                >
                  {t(`wallet.period_${p}`)}
                </Link>
              ))}
            </div>
          }
        />
        {report.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table
            headers={[
              t("wallet.colPeriod"),
              t("accounts.colOrders"),
              t("accounts.colSales"),
              t("wallet.totalCommission"),
              t("wallet.paidWithdrawals"),
            ]}
          >
            {report.results.map((row) => (
              <tr key={row.label} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{row.label}</span></Td>
                <Td>{fmt.num(row.orders)}</Td>
                <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                <Td>{fmt.money(row.commission)}</Td>
                <Td>{fmt.money(row.withdrawals_paid)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("accounts.salesByBranch")} />
          {dashboard.sales_by_branch.length === 0 ? (
            <EmptyState title={t("accounts.noSalesYet")} />
          ) : (
            <Table headers={[t("accounts.colBranch"), t("accounts.colOrders"), t("accounts.colSales")]}>
              {dashboard.sales_by_branch.map((row) => (
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
          <CardHeader title={t("accounts.salesByPayment")} />
          {dashboard.sales_by_payment.length === 0 ? (
            <EmptyState title={t("accounts.noSalesYet")} />
          ) : (
            <Table headers={[t("accounts.colMethod"), t("accounts.colOrders"), t("accounts.colSales")]}>
              {dashboard.sales_by_payment.map((row) => (
                <tr key={row.payment_method} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{t(`payment.${row.payment_method}`)}</span></Td>
                  <Td>{fmt.num(row.orders)}</Td>
                  <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
