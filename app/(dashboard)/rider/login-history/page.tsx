import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("riderLoc.loginHistoryTitle") };
}

/** /rider/login-history — the rider's own login records. */
export default async function RiderLoginHistoryPage() {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const items = await prisma.loginHistory.findMany({
    where: { userId: Number(me.id) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader title={t("riderLoc.loginHistoryTitle")} subtitle={t("riderLoc.loginHistorySub")} />
      <Card>
        {items.length === 0 ? (
          <EmptyState title={t("riderLoc.noLogins")} />
        ) : (
          <Table headers={[t("pages.colDate"), t("riderLoc.time")]}>
            {items.map((l) => (
              <tr key={l.id} className="hover:bg-surface-hover/70">
                <Td><span className="text-sm text-fg-muted">{fmt.date(l.createdAt.toISOString())}</span></Td>
                <Td><span className="text-sm">{fmt.time(l.createdAt.toISOString())}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
