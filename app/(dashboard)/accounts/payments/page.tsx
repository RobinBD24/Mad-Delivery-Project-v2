import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.paymentsTitle") };
}

interface PaymentsPayload {
  total_collected: string;
  pending_orders: number;
  cancelled_orders: number;
  by_method: { payment_method: string; orders: number; sales: string }[];
}

/** /accounts/payments — collections + payment-method breakdown. */
export default async function AccountsPaymentsPage() {
  await requireRole("accounts", "super_admin");
  const { t, fmt } = await getT();
  const data = await getJSON<PaymentsPayload>("/accounts/payments/");

  return (
    <>
      <PageHeader title={t("pages.paymentsTitle")} subtitle={t("pages.paymentsSub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("wallet.totalCollected")} value={fmt.money(data.total_collected)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("wallet.pendingOrders")} value={fmt.num(data.pending_orders)} icon={<Icon name="clock" />} accent="amber" />
        <StatCard label={t("accounts.cancelledOrders")} value={fmt.num(data.cancelled_orders)} icon={<Icon name="x" />} accent="slate" />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("accounts.salesByPayment")} />
        {data.by_method.length === 0 ? (
          <EmptyState title={t("accounts.noSalesYet")} />
        ) : (
          <Table headers={[t("accounts.colMethod"), t("accounts.colOrders"), t("accounts.colSales")]}>
            {data.by_method.map((row) => (
              <tr key={row.payment_method} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{t(`payment.${row.payment_method}`)}</span></Td>
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
