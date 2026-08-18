import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AttendancePanel } from "@/components/branch/attendance-panel";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("b6.title") };
}

/** /branch-manager/attendance — branch employee attendance (own branch). */
export default async function BranchAttendancePage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  return (
    <>
      <PageHeader title={t("b6.title")} subtitle={t("b6.subtitle")} />
      <Card>
        <CardContent className="py-6">
          <AttendancePanel />
        </CardContent>
      </Card>
    </>
  );
}
