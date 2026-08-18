import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.invoicesTitle") };
}

/** /accounts/invoices — invoice per order; open to view/print. */
export default async function AccountsInvoicesPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");

  const orders = await prisma.order.findMany({
    include: { customer: true, branch: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader title={t("financials.invoicesTitle")} subtitle={t("financials.invoicesSub")} />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table headers={[t("financials.invoiceNo"), t("adminExtras.colCustomer"), t("pages.colBranch"), t("pages.colAmount"), t("pages.colDate"), ""]}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-semibold text-fg-base">INV-{String(o.id).padStart(5, "0")}</span></Td>
                <Td>{`${o.customer.firstName} ${o.customer.lastName}`.trim() || o.customer.username}</Td>
                <Td>{o.branch.name}</Td>
                <Td><span className="font-semibold">{fmt.money(o.totalAmount.toString())}</span></Td>
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(o.createdAt.toISOString())}</span></Td>
                <Td className="text-right">
                  <Link href={`/accounts/invoices/${o.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {t("financials.viewInvoice")}
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
