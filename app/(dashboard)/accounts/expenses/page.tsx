import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ExpenseForm } from "@/components/accounts/financial-forms";
import { getJSON } from "@/lib/api/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.expensesTitle") };
}

interface ExpenseT {
  id: number;
  branch_name: string;
  category: string;
  amount: string;
  note: string;
  expense_date: string;
  created_by_name: string | null;
}

/** /accounts/expenses — branch-wise expense records (rent/utilities/salary/…). */
export default async function AccountsExpensesPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");

  const [data, branches] = await Promise.all([
    getJSON<Paginated<ExpenseT>>("/accounts/expenses/?page_size=100"),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const total = data.results.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <>
      <PageHeader title={t("financials.expensesTitle")} subtitle={t("financials.expensesSub", { amount: fmt.money(total) })} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("financials.recordExpense")} />
          <CardContent>
            <ExpenseForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("financials.expenseHistory")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("financials.noExpenses")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("pages.colBranch"), t("financials.category"), t("pages.colAmount"), t("financials.noteLabel"), t("financials.recordedBy")]}>
              {data.results.map((e) => (
                <tr key={e.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-xs text-fg-muted">{fmt.date(e.expense_date)}</span></Td>
                  <Td>{e.branch_name}</Td>
                  <Td>{t(`financials.cat_${e.category}`)}</Td>
                  <Td><span className="font-semibold">{fmt.money(e.amount)}</span></Td>
                  <Td><span className="text-xs text-fg-muted">{e.note || "—"}</span></Td>
                  <Td><span className="text-xs text-fg-muted">{e.created_by_name ?? "—"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
