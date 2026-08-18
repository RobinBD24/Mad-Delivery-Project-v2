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
import type { Paginated, RiderCommissionT, WalletSummaryT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.earningsTitle") };
}

/** /rider/earnings — real commission ledger (one row per delivered order). */
export default async function RiderEarningsPage() {
  const { t, fmt } = await getT();
  await requireRole("rider");

  const [wallet, ledger] = await Promise.all([
    getJSON<WalletSummaryT>("/rider/wallet/"),
    getJSON<Paginated<RiderCommissionT>>("/rider/earnings/?page_size=100"),
  ]);

  return (
    <>
      <PageHeader title={t("rider.earningsTitle")} subtitle={t("rider.earningsSub")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("wallet.totalEarnings")} value={fmt.money(wallet.total_earnings)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("wallet.commissionedDeliveries")} value={fmt.num(wallet.total_deliveries)} icon={<Icon name="bike" />} accent="blue" />
        <StatCard label={t("wallet.availableBalance")} value={fmt.money(wallet.available_balance)} icon={<Icon name="check" />} accent="brand" />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("wallet.commissionLedger")} subtitle={t("wallet.commissionLedgerSub")} />
        {ledger.results.length === 0 ? (
          <EmptyState title={t("wallet.noCommissionsTitle")} description={t("wallet.noCommissionsDesc")} />
        ) : (
          <Table headers={[t("pages.colDate"), t("wallet.colOrder"), t("pages.colBranch"), t("pages.colAmount")]}>
            {ledger.results.map((c) => (
              <tr key={c.id} className="hover:bg-surface-hover/70">
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(c.created_at)}</span></Td>
                <Td><span className="font-semibold text-fg-base">#{fmt.num(c.order)}</span></Td>
                <Td>{c.branch_name ?? "—"}</Td>
                <Td><span className="font-semibold text-emerald-600">+{fmt.money(c.amount)}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
