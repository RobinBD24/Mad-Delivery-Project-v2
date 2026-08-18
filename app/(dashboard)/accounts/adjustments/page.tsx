import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { AdjustmentForm } from "@/components/accounts/financial-forms";
import { getJSON } from "@/lib/api/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.adjustmentsTitle") };
}

interface AdjustmentT {
  id: number;
  type: string;
  amount: string;
  note: string;
  branch_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** /accounts/adjustments — authorized manual financial adjustments. */
export default async function AccountsAdjustmentsPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");

  const [data, branches] = await Promise.all([
    getJSON<Paginated<AdjustmentT>>("/accounts/adjustments/?page_size=100"),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title={t("financials.adjustmentsTitle")} subtitle={t("financials.adjustmentsSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("financials.recordAdjustment")} />
          <CardContent>
            <AdjustmentForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("financials.adjustmentHistory")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("financials.noAdjustments")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("financials.typeLabel"), t("pages.colAmount"), t("pages.colBranch"), t("financials.noteLabel"), t("financials.recordedBy")]}>
              {data.results.map((a) => (
                <tr key={a.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(a.created_at)}</span></Td>
                  <Td>
                    <Badge tone={a.type === "credit" ? "green" : "red"}>
                      {t(`financials.${a.type}`)}
                    </Badge>
                  </Td>
                  <Td>
                    <span className={a.type === "credit" ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                      {a.type === "credit" ? "+" : "-"}
                      {fmt.money(a.amount)}
                    </span>
                  </Td>
                  <Td>{a.branch_name ?? "—"}</Td>
                  <Td><span className="text-xs text-fg-muted">{a.note}</span></Td>
                  <Td><span className="text-xs text-fg-muted">{a.created_by_name ?? "—"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
