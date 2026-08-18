import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated, RiderEarningRowT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("wallet.riderEarningsTitle") };
}

/** /accounts/rider-earnings — per-rider earnings, balances and payouts. */
export default async function AccountsRiderEarningsPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const data = await getJSON<Paginated<RiderEarningRowT>>("/accounts/rider-earnings/");

  const totals = data.results.reduce(
    (acc, r) => ({
      earnings: acc.earnings + Number(r.total_earnings),
      available: acc.available + Number(r.available_balance),
      paid: acc.paid + Number(r.paid_amount),
    }),
    { earnings: 0, available: 0, paid: 0 },
  );

  return (
    <>
      <PageHeader title={t("wallet.riderEarningsTitle")} subtitle={t("wallet.riderEarningsSub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("wallet.totalCommission")} value={fmt.money(totals.earnings)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("wallet.totalOwedRiders")} value={fmt.money(totals.available)} icon={<Icon name="clock" />} accent="amber" />
        <StatCard label={t("wallet.paidWithdrawals")} value={fmt.money(totals.paid)} icon={<Icon name="check" />} accent="blue" />
      </div>

      <Card className="mt-6">
        {data.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table
            headers={[
              t("wallet.colRider"),
              t("pages.colBranch"),
              t("wallet.colDeliveries"),
              t("wallet.totalEarnings"),
              t("wallet.pendingWithdrawals"),
              t("wallet.paidWithdrawals"),
              t("wallet.availableBalance"),
            ]}
          >
            {data.results.map((r) => (
              <tr key={r.rider} className="hover:bg-surface-hover/70">
                <Td>
                  <span className="font-medium text-fg-base">{r.rider_name}</span>
                  <span className="block text-xs text-fg-subtle">@{r.rider_username}</span>
                </Td>
                <Td>{r.branch_name ?? "—"}</Td>
                <Td>{fmt.num(r.deliveries)}</Td>
                <Td><span className="font-semibold">{fmt.money(r.total_earnings)}</span></Td>
                <Td>{fmt.money(r.pending_amount)}</Td>
                <Td>{fmt.money(r.paid_amount)}</Td>
                <Td><span className="font-semibold text-emerald-600">{fmt.money(r.available_balance)}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
