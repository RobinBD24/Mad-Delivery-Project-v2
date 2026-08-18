import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RamadanTransactionsPanel } from "@/components/accounts/ramadan-transactions-panel";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("ramadan.transactions") };
}

/** /accounts/ramadan — Ramadan advance transactions + refunds. */
export default async function AccountsRamadanPage() {
  const { t } = await getT();
  await requireRole("accounts");
  return (
    <>
      <PageHeader title={t("ramadan.transactions")} subtitle={t("ramadan.reconcile")} />
      <Card>
        <CardContent className="py-6">
          <RamadanTransactionsPanel canRefund={true} />
        </CardContent>
      </Card>
    </>
  );
}
