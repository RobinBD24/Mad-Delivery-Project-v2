import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { riderDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

export const metadata: Metadata = { title: "Duty History" };

/** /rider/duty-history — the signed-in rider's last-30-days duty logs. */
export default async function RiderDutyHistoryPage() {
  const me = await requireRole("rider");
  const { t, fmt } = await getT();
  const data = (await riderDashboard(me)) as RiderDashboard;
  const logs = data.duty_history ?? [];

  return (
    <>
      <PageHeader title={t("pages.dutyHistoryTitle")} subtitle={t("pages.dutyHistorySub")} />
      <Card>
        {logs.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table
            headers={[
              t("pages.colDate"),
              t("pages.colBranch"),
              t("pages.colClockIn"),
              t("pages.colClockOut"),
              t("pages.colDuration"),
              t("common.status"),
            ]}
          >
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{fmt.date(log.date)}</span></Td>
                <Td>{log.branch_name}</Td>
                <Td>{log.clock_in ? fmt.time(log.clock_in) : "—"}</Td>
                <Td>{log.clock_out ? fmt.time(log.clock_out) : "—"}</Td>
                <Td>
                  {log.duration_minutes === null
                    ? t("rider.onDutyNow")
                    : t("rider.durationHm", {
                        h: fmt.num(Math.floor(log.duration_minutes / 60)),
                        m: fmt.num(log.duration_minutes % 60),
                      })}
                </Td>
                <Td>
                  {log.is_on_duty ? (
                    <Badge tone="green">{t("pages.onDuty")}</Badge>
                  ) : (
                    <Badge tone="slate">{t("common.inactive")}</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
