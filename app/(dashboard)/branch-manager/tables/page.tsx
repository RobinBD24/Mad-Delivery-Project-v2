import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TableLayoutEditor } from "@/components/branch/table-layout-editor";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { branchForManager } from "@/lib/selectors";
import { serializeTable, tablesForBranch } from "@/lib/services/branch-ops";
import type { TableRow } from "@/components/branch/table-layout-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("b3.tablesTitle") };
}

/** /branch-manager/tables — graphical table-layout editor (own branch). */
export default async function BranchTablesPage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  const me = (await getSessionUser())!;
  const branch = (await branchForManager(me.id))!;
  const tables = (await tablesForBranch(branch.id)).map(serializeTable) as unknown as TableRow[];

  return (
    <>
      <PageHeader title={t("b3.tablesTitle")} subtitle={t("b3.tablesSub")} />
      <Card>
        <CardContent className="py-6">
          <TableLayoutEditor tables={tables} />
        </CardContent>
      </Card>
    </>
  );
}
