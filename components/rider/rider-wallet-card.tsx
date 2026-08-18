import { Icon } from "@/components/layout/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, ViewAllLink } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

/**
 * Design's "My Wallet" panel — REAL balance from the commission/withdrawal
 * ledger (riderWalletSummary), with working Withdraw + Transactions actions.
 */
export async function RiderWalletCard({ data }: { data: RiderDashboard }) {
  const { t, fmt } = await getT();

  return (
    <Card>
      <CardHeader
        title={t("rider.wallet")}
        action={<ViewAllLink href="/rider/wallet">{t("common.viewAll")}</ViewAllLink>}
      />
      <CardContent>
        <div className="rounded-xl border border-rider-600/20 bg-gradient-to-br from-rider-50 to-emerald-100/60 px-4 py-3 dark:from-rider-500/15 dark:to-rider-500/5">
          <p className="text-xs text-fg-muted">{t("rider.currentBalance")}</p>
          <p className="font-heading text-2xl font-extrabold text-rider-700 dark:text-rider-500">
            {fmt.money(data.wallet.available_balance)}
          </p>
          {data.wallet.pending_withdrawals > 0 ? (
            <p className="mt-0.5 text-xs text-amber-600">
              {t("rider.pendingWithdrawals")}: {fmt.money(data.wallet.pending_withdrawals)}
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <ButtonLink href="/rider/withdrawals" variant="success" size="sm" className="w-full">
            <Icon name="money" className="size-4" /> {t("rider.withdraw")}
          </ButtonLink>
          <ButtonLink href="/rider/wallet" variant="outline" size="sm" className="w-full">
            <Icon name="list" className="size-4" /> {t("rider.transactions")}
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
