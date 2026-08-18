import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { RefundForm } from "@/components/accounts/financial-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.refundsTitle") };
}

interface RefundT {
  id: number;
  order: number;
  amount: string;
  reason: string;
  processed_by_name: string | null;
  created_at: string;
}

/** /accounts/refunds — process customer refunds + full history. */
export default async function AccountsRefundsPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const data = await getJSON<Paginated<RefundT>>("/accounts/refunds/?page_size=100");

  return (
    <>
      <PageHeader title={t("financials.refundsTitle")} subtitle={t("financials.refundsSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("financials.processRefund")} />
          <CardContent>
            <RefundForm />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("financials.refundHistory")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("financials.noRefunds")} />
          ) : (
            <Table headers={[t("wallet.colOrder"), t("pages.colAmount"), t("adminExtras.colReason"), t("financials.processedBy"), t("pages.colDate")]}>
              {data.results.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-semibold text-fg-base">#{fmt.num(r.order)}</span></Td>
                  <Td><span className="font-semibold text-red-600">-{fmt.money(r.amount)}</span></Td>
                  <Td><span className="text-sm text-fg-muted">{r.reason}</span></Td>
                  <Td>{r.processed_by_name ?? "—"}</Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(r.created_at)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
