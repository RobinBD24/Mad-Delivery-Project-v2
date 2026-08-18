import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmployeesPanel } from "@/components/branch/employees-panel";
import { TeamsPanel } from "@/components/branch/teams-panel";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("b5.title") };
}

/** /branch-manager/employees — branch employee management (own branch). */
export default async function BranchEmployeesPage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  return (
    <>
      <PageHeader title={t("b5.title")} subtitle={t("b5.subtitle")} />
      {/* PHASE M — teams first: employees are assigned into them below. */}
      <Card className="mb-4.5">
        <CardHeader title={t("employees.teamsTitle")} />
        <CardContent className="py-6">
          <TeamsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <EmployeesPanel />
        </CardContent>
      </Card>
    </>
  );
}
