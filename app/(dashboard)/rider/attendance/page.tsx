import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { AttendanceMarker } from "@/components/branch/attendance-marker";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { midnight, daysAgo } from "@/lib/utils/dates";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("bmExtras.attendanceTitle") };
}

/** /rider/attendance — rider marks daily attendance + history. */
export default async function RiderAttendancePage() {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const userId = Number(me.id);

  const [today, history] = await Promise.all([
    prisma.staffAttendance.findUnique({ where: { userId_date: { userId, date: midnight() } } }),
    prisma.staffAttendance.findMany({ where: { userId, date: { gte: daysAgo(30) } }, orderBy: { date: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title={t("bmExtras.attendanceTitle")} subtitle={t("bmExtras.attendanceSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("bmExtras.markToday")} />
          <CardContent>
            <AttendanceMarker todayStatus={today?.status ?? null} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("bmExtras.attendanceHistory")} />
          {history.length === 0 ? (
            <EmptyState title={t("bmExtras.noAttendance")} />
          ) : (
            <Table headers={[t("pages.colDate"), t("pages.colStatus"), t("bmExtras.noteLabel")]}>
              {history.map((a) => (
                <tr key={a.id} className="hover:bg-surface-hover/70">
                  <Td><span className="text-sm text-fg-muted">{fmt.date(a.date.toISOString())}</span></Td>
                  <Td><span className="text-sm font-medium">{t(`bmExtras.att_${a.status}`)}</span></Td>
                  <Td><span className="text-xs text-fg-muted">{a.note || "—"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
