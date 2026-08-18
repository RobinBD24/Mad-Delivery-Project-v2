import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { RedeemForm } from "@/components/customer/redeem-form";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rewards.title") };
}

interface RewardsPayload {
  balance: number;
  balance_tk: string;
  coin_value_tk: string;
  min_redeem_coins: number;
  rules: { key: string; coins: number; is_active: boolean }[];
  ledger: { id: number; coins: number; reason: string; created_at: string }[];
}

/** /customer/rewards — coin balance, earn rules, redeem, activity ledger. */
export default async function CustomerRewardsPage() {
  const { t, fmt } = await getT();
  await requireRole("customer");
  const data = await getJSON<RewardsPayload>("/customer/rewards/");

  return (
    <>
      <PageHeader title={t("rewards.title")} subtitle={t("rewards.subtitle")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("rewards.balance")} value={fmt.num(data.balance)} sub={t("rewards.worthTk", { amount: fmt.money(data.balance_tk) })} icon={<Icon name="check" />} accent="brand" />
        <StatCard label={t("rewards.coinValue")} value={fmt.money(data.coin_value_tk)} sub={t("rewards.perCoin")} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("rewards.minRedeemLabel")} value={fmt.num(data.min_redeem_coins)} icon={<Icon name="lock" />} accent="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("rewards.redeem")} />
            <CardContent>
              <RedeemForm
                balance={data.balance}
                minRedeem={data.min_redeem_coins}
                coinValueTk={data.coin_value_tk}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={t("rewards.howToEarn")} />
            <CardContent>
              <ul className="space-y-2.5">
                {data.rules
                  .filter((r) => r.is_active && r.coins > 0)
                  .map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-fg-muted">{t(`rewards.rule_${r.key}`)}</span>
                      <span className="font-semibold text-brand-600">+{fmt.num(r.coins)}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title={t("rewards.activity")} />
          {data.ledger.length === 0 ? (
            <EmptyState title={t("rewards.emptyTitle")} description={t("rewards.emptyDesc")} />
          ) : (
            <CardContent className="p-0">
              <ul className="divide-y divide-border-base">
                {data.ledger.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-fg-base">
                        {l.reason === "redeem" ? t("rewards.entryRedeem") : t(`rewards.rule_${l.reason}`)}
                      </p>
                      <p className="text-xs text-fg-subtle">{fmt.dateTime(l.created_at)}</p>
                    </div>
                    <span className={l.coins >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
                      {l.coins >= 0 ? "+" : ""}
                      {fmt.num(l.coins)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
