import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { CustomerBlockButton } from "@/components/admin/customer-block-button";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.blockedTitle") };
}

/** /admin/customers/blocked — blocked (fake-order) customers with reasons. */
export default async function AdminBlockedCustomersPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  const blocked = await prisma.user.findMany({
    where: { role: "customer", isBlocked: true },
    include: { _count: { select: { orders: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title={t("adminExtras.blockedTitle")}
        subtitle={t("adminExtras.blockedSub")}
        action={
          <ButtonLink href="/admin/customers" variant="outline">
            {t("adminExtras.allCustomers")}
          </ButtonLink>
        }
      />
      <Card>
        {blocked.length === 0 ? (
          <EmptyState title={t("adminExtras.noBlockedTitle")} description={t("adminExtras.noBlockedDesc")} />
        ) : (
          <Table
            headers={[
              t("adminExtras.colCustomer"),
              t("adminExtras.colContact"),
              t("adminExtras.colOrders"),
              t("adminExtras.colReason"),
              t("pages.colActions"),
            ]}
          >
            {blocked.map((c) => (
              <tr key={c.id} className="hover:bg-surface-hover/70">
                <Td>
                  <span className="block font-medium text-fg-base">
                    {`${c.firstName} ${c.lastName}`.trim() || c.username}
                  </span>
                  <span className="block text-xs text-fg-subtle">@{c.username}</span>
                </Td>
                <Td>
                  <span className="block text-sm">{c.phone || "—"}</span>
                  <span className="block text-xs text-fg-subtle">{c.email}</span>
                </Td>
                <Td>{fmt.num(c._count.orders)}</Td>
                <Td>
                  <span className="text-sm text-red-600">{c.blockedReason || "—"}</span>
                </Td>
                <Td className="text-right">
                  <CustomerBlockButton userId={c.id} isBlocked />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
