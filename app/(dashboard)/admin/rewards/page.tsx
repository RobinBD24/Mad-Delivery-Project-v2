import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RewardConfigForm } from "@/components/admin/reward-config-form";
import { RewardProgramToggle } from "@/components/admin/reward-program-toggle";
import { RewardRulesManager, type EarningRuleRow } from "@/components/admin/reward-rules-manager";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rewards.adminTitle") };
}

interface ConfigPayload {
  coin_value_tk: string;
  min_redeem_coins: number;
  rules: { key: string; coins: number; is_active: boolean }[];
  program_active: boolean;
}

/** /admin/rewards — reward coin rules & Tk value (super admin). */
export default async function AdminRewardsPage() {
  const { t } = await getT();
  await requireRole("super_admin");
  const config = await getJSON<ConfigPayload>("/admin/rewards/");
  // PHASE H — earning rules + the branch list their scope selector needs.
  const [rules, branches] = await Promise.all([
    getJSON<{ results: EarningRuleRow[] }>("/admin/reward-rules/"),
    getJSON<{ results: { id: number; name: string }[] }>("/branches/?page_size=100"),
  ]);

  return (
    <>
      <PageHeader title={t("rewards.adminTitle")} subtitle={t("rewards.adminSub")} />

      {/* PHASE G — global programme switch. Pausing stops future earning and
          redemption; balances and ledger history are preserved. */}
      <Card className="mb-4.5 max-w-2xl">
        <CardContent>
          <RewardProgramToggle active={config.program_active} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader title={t("rewards.configTitle")} />
        <CardContent>
          <RewardConfigForm
            coinValueTk={config.coin_value_tk}
            minRedeemCoins={config.min_redeem_coins}
            rules={config.rules}
          />
        </CardContent>
      </Card>

      {/* PHASE H — earning rules. The fixed coin amounts above still apply to
          profile/daily-login, and to delivered orders when no rule matches. */}
      <Card className="mt-4.5 max-w-4xl">
        <CardHeader title={t("rewards.rulesTitle")} />
        <CardContent>
          <RewardRulesManager rules={rules.results} branches={branches.results} />
        </CardContent>
      </Card>
    </>
  );
}
