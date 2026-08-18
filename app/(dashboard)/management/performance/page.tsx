import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { managementDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { ManagementDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.perfTitle") };
}

/** /management/performance — branch + rider performance (real dashboard aggregates). */
export default async function ManagementPerformancePage() {
  const { t, fmt } = await getT();
  await requireRole("management");
  const data = (await managementDashboard()) as ManagementDashboard;

  return (
    <>
      <PageHeader title={t("pages.perfTitle")} subtitle={t("pages.perfSub")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("pages.branchPerformance")} />
          {data.branch_performance.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colBranch"), t("pages.colOrders"), t("pages.colSales")]}>
              {data.branch_performance.map((row) => (
                <tr key={row.branch__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.branch__name}</span></Td>
                  <Td>{fmt.num(row.orders)}</Td>
                  <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("pages.topRiders")} />
          {data.top_riders.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colRider"), t("pages.colDeliveries"), t("pages.colSales")]}>
              {data.top_riders.map((row) => (
                <tr key={row.rider__id} className="hover:bg-surface-hover/70">
                  <Td>
                    <span className="font-medium text-fg-base">
                      {`${row.rider__first_name} ${row.rider__last_name}`.trim() || row.rider__username}
                    </span>
                  </Td>
                  <Td>{fmt.num(row.deliveries)}</Td>
                  <Td><span className="font-semibold">{fmt.money(row.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
