import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.auditTitle") };
}

interface AuditT {
  id: number;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  actor_name: string | null;
  created_at: string;
}

/** /accounts/audit-log — append-only trail of every financial action. */
export default async function AccountsAuditLogPage() {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const data = await getJSON<Paginated<AuditT>>("/accounts/audit-log/?page_size=200");

  return (
    <>
      <PageHeader title={t("financials.auditTitle")} subtitle={t("financials.auditSub")} />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table headers={[t("pages.colDate"), t("financials.actor"), t("financials.actionLabel"), t("financials.detailLabel")]}>
            {data.results.map((l) => (
              <tr key={l.id} className="hover:bg-surface-hover/70">
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(l.created_at)}</span></Td>
                <Td>{l.actor_name ?? "—"}</Td>
                <Td>
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                    {l.action}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm text-fg-muted">
                    {l.entity} #{l.entity_id} — {l.detail}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
