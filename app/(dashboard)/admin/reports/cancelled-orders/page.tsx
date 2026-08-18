import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminReports.cancelledTitle") };
}

const RANGES = { today: 1, week: 7, month: 30 } as const;
type RangeKey = keyof typeof RANGES;

type Params = { searchParams: Promise<{ range?: string }> };

/** /admin/reports/cancelled-orders — cancelled orders with range filter. */
export default async function AdminCancelledReportPage({ searchParams }: Params) {
  const { t, fmt } = await getT();
  await requireRole("super_admin");
  const sp = await searchParams;
  const range: RangeKey = (Object.keys(RANGES) as RangeKey[]).includes(sp.range as RangeKey)
    ? (sp.range as RangeKey)
    : "today";
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (range !== "today") since.setDate(since.getDate() - RANGES[range] + 1);

  const orders = await prisma.order.findMany({
    where: { status: "cancelled", createdAt: { gte: since } },
    include: { branch: true, customer: true },
    orderBy: { createdAt: "desc" },
  });
  const lost = orders.reduce((acc, o) => acc + Number(o.totalAmount), 0);

  const tab = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <>
      <PageHeader
        title={t("adminReports.cancelledTitle")}
        subtitle={t("adminReports.cancelledSub", { amount: fmt.money(lost) })}
        action={
          <div className="flex items-center gap-1.5 rounded-full bg-surface-muted p-1">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Link
                key={r}
                href={`/admin/reports/cancelled-orders?range=${r}`}
                className={cn(tab, range === r ? "bg-surface-card text-brand-600 shadow-sm" : "text-fg-muted")}
              >
                {t(`adminReports.range_${r}`)}
              </Link>
            ))}
          </div>
        }
      />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title={t("adminReports.noCancelled")} />
        ) : (
          <Table headers={["#", t("adminExtras.colCustomer"), t("pages.colBranch"), t("pages.colAmount"), t("pages.colDate")]}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-semibold text-fg-base">#{fmt.num(o.id)}</span></Td>
                <Td>{`${o.customer.firstName} ${o.customer.lastName}`.trim() || o.customer.username}</Td>
                <Td>{o.branch.name}</Td>
                <Td><span className="font-semibold text-red-600">{fmt.money(o.totalAmount.toString())}</span></Td>
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(o.createdAt.toISOString())}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
