import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { WalletSummaryT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.walletTitle") };
}

/** /rider/wallet — real commission-ledger balance + shortcuts. */
export default async function RiderWalletPage() {
  const { t, fmt } = await getT();
  await requireRole("rider");
  const wallet = await getJSON<WalletSummaryT>("/rider/wallet/");

  return (
    <>
      <PageHeader title={t("rider.walletTitle")} subtitle={t("rider.walletSub")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("rider.wallet")} />
          <CardContent>
            <div className="rounded-2xl bg-linear-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-card">
              <p className="text-xs font-medium text-emerald-100">{t("wallet.availableBalance")}</p>
              <p className="mt-1 text-3xl font-bold">{fmt.money(wallet.available_balance)}</p>
              <p className="mt-2 text-xs text-emerald-100">
                {t("wallet.rateNow", { amount: fmt.money(wallet.commission_rate) })}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ButtonLink href="/rider/withdrawals" variant="primary" size="sm">
                <Icon name="money" className="size-4" /> {t("rider.withdraw")}
              </ButtonLink>
              <ButtonLink href="/rider/earnings" variant="outline" size="sm">
                <Icon name="list" className="size-4" /> {t("rider.transactions")}
              </ButtonLink>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <StatCard label={t("wallet.totalEarnings")} value={fmt.money(wallet.total_earnings)} icon={<Icon name="money" />} accent="green" />
          <StatCard label={t("wallet.commissionedDeliveries")} value={fmt.num(wallet.total_deliveries)} icon={<Icon name="check" />} accent="blue" />
          <StatCard label={t("wallet.pendingWithdrawals")} value={fmt.money(wallet.pending_amount)} icon={<Icon name="clock" />} accent="amber" />
          <StatCard label={t("wallet.paidWithdrawals")} value={fmt.money(wallet.paid_amount)} icon={<Icon name="chart" />} accent="violet" />
        </div>
      </div>
    </>
  );
}
