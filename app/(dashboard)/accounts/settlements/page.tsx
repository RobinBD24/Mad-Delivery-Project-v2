import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { SettlementForm } from "@/components/accounts/financial-forms";
import { getJSON } from "@/lib/api/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.settlementsTitle") };
}

interface SettlementT {
  id: number;
  branch_name: string;
  date: string;
  orders: number;
  sales: string;
  commission: string;
  expenses: string;
  net: string;
  generated_by_name: string | null;
}

/** /accounts/settlements — end-of-day branch settlement snapshots. */
export default async function AccountsSettlementsPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");

  const [data, branches] = await Promise.all([
    getJSON<Paginated<SettlementT>>("/accounts/settlements/?page_size=100"),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title={t("financials.settlementsTitle")} subtitle={t("financials.settlementsSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("financials.generateSettlement")} subtitle={t("financials.generateSub")} />
          <CardContent>
            <SettlementForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("financials.settlementHistory")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("financials.noSettlements")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("pages.colBranch"), t("accounts.colOrders"), t("accounts.colSales"), t("wallet.totalCommission"), t("financials.expensesLabel"), t("financials.netLabel")]}>
              {data.results.map((s) => (
                <tr key={s.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-xs text-fg-muted">{fmt.date(s.date)}</span></Td>
                  <Td>{s.branch_name}</Td>
                  <Td>{fmt.num(s.orders)}</Td>
                  <Td>{fmt.money(s.sales)}</Td>
                  <Td>{fmt.money(s.commission)}</Td>
                  <Td>{fmt.money(s.expenses)}</Td>
                  <Td><span className="font-semibold text-emerald-600">{fmt.money(s.net)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
