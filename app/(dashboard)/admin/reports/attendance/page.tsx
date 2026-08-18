import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { daysAgo } from "@/lib/utils/dates";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminReports.attendanceTitle") };
}

/** /admin/reports/attendance — daily attendance across sections:
 * rider duty logs + manager login activity (last 7 days). */
export default async function AdminAttendanceReportPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  const [duties, managerLogins] = await Promise.all([
    prisma.riderDutyLog.findMany({
      where: { date: { gte: daysAgo(7) } },
      include: { rider: true, branch: true },
      orderBy: [{ date: "desc" }, { clockIn: "desc" }],
    }),
    prisma.managerActivityLog.findMany({
      where: { activityType: "login", timestamp: { gte: daysAgo(7) } },
      include: { manager: true, branch: true },
      orderBy: { timestamp: "desc" },
      take: 100,
    }),
  ]);

  return (
    <>
      <PageHeader title={t("adminReports.attendanceTitle")} subtitle={t("adminReports.attendanceSub")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("adminReports.riderDuty")} />
          {duties.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("wallet.colRider"), t("pages.colBranch"), t("pages.colDate"), t("adminReports.clockIn"), t("adminReports.clockOut")]}>
              {duties.map((d) => (
                <tr key={d.id} className="hover:bg-surface-hover/70">
                  <Td>{`${d.rider.firstName} ${d.rider.lastName}`.trim() || d.rider.username}</Td>
                  <Td>{d.branch.name}</Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.date(d.date.toISOString())}</span></Td>
                  <Td><span className="text-xs">{fmt.time(d.clockIn.toISOString())}</span></Td>
                  <Td>
                    <span className="text-xs">
                      {d.clockOut ? fmt.time(d.clockOut.toISOString()) : t("adminReports.onDuty")}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("adminReports.managerLogins")} />
          {managerLogins.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("adminExtras.colStaff"), t("pages.colBranch"), t("pages.colDate")]}>
              {managerLogins.map((l) => (
                <tr key={l.id} className="hover:bg-surface-hover/70">
                  <Td>{`${l.manager.firstName} ${l.manager.lastName}`.trim() || l.manager.username}</Td>
                  <Td>{l.branch?.name ?? "—"}</Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(l.timestamp.toISOString())}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
