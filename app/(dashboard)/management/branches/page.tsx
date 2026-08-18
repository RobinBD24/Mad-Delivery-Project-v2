import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Branch, Paginated } from "@/types";

export const metadata: Metadata = { title: "Branches" };

/** /management/branches — read-only branch directory for management. */
export default async function ManagementBranchesPage() {
  await requireRole("management");
  const { t } = await getT();
  const data = await getJSON<Paginated<Branch>>("/branches/?page_size=100");

  return (
    <>
      <PageHeader title={t("pages.branchesTitle")} subtitle={t("pages.branchesSub")} />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table headers={[t("branches.branch"), t("common.phone"), t("branches.manager"), t("common.status")]}>
            {data.results.map((branch) => (
              <tr key={branch.id} className="hover:bg-surface-hover/70">
                <Td>
                  <span className="font-semibold text-fg-base">{branch.name}</span>
                  <span className="block max-w-56 truncate text-xs text-fg-subtle">{branch.address}</span>
                </Td>
                <Td>{branch.phone}</Td>
                <Td>{branch.manager_name ?? <span className="text-fg-subtle">{t("common.notAssigned")}</span>}</Td>
                <Td>
                  {branch.is_active ? (
                    <Badge tone="green">{t("common.active")}</Badge>
                  ) : (
                    <Badge tone="red">{t("common.inactive")}</Badge>
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
