import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { WithdrawalRequestForm } from "@/components/wallet/withdrawal-request-form";
import { WithdrawalStatusBadge } from "@/components/wallet/withdrawal-status-badge";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated, RiderWithdrawalT, WalletSummaryT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("wallet.withdrawalsTitle") };
}

/** /rider/withdrawals — request form + own withdrawal history/status. */
export default async function RiderWithdrawalsPage() {
  const { t, fmt } = await getT();
  await requireRole("rider");

  const [wallet, history] = await Promise.all([
    getJSON<WalletSummaryT>("/rider/wallet/"),
    getJSON<Paginated<RiderWithdrawalT>>("/rider/withdrawals/?page_size=100"),
  ]);

  return (
    <>
      <PageHeader title={t("wallet.withdrawalsTitle")} subtitle={t("wallet.withdrawalsSub")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("wallet.requestWithdrawal")} />
          <CardContent>
            <WithdrawalRequestForm availableBalance={wallet.available_balance} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("wallet.withdrawalHistory")} />
          {history.results.length === 0 ? (
            <EmptyState title={t("wallet.noWithdrawalsTitle")} description={t("wallet.noWithdrawalsDesc")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("pages.colAmount"), t("pages.colStatus"), t("wallet.colDecidedBy")]}>
              {history.results.map((w) => (
                <tr key={w.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(w.created_at)}</span></Td>
                  <Td><span className="font-semibold">{fmt.money(w.amount)}</span></Td>
                  <Td>
                    <WithdrawalStatusBadge status={w.status} />
                    {w.status === "rejected" && w.rejection_reason ? (
                      <p className="mt-1 text-xs text-red-500">{w.rejection_reason}</p>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="text-xs text-fg-muted">
                      {w.decided_by_name ?? "—"}
                      {w.paid_at ? ` · ${fmt.dateTime(w.paid_at)}` : ""}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
