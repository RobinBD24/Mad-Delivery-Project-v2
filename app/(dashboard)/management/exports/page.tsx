import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { MANAGEMENT_REPORTS } from "@/lib/services/management";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("mgmtReports.exportsTitle") };
}

/** /management/exports — download every report as CSV (Excel-compatible). */
export default async function ManagementExportsPage() {
  const { t } = await getT();
  await requireRole("management", "super_admin");

  return (
    <>
      <PageHeader title={t("mgmtReports.exportsTitle")} subtitle={t("mgmtReports.exportsSub")} />
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border-base">
            {MANAGEMENT_REPORTS.map((type) => (
              <li key={type} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-surface-muted text-fg-muted">
                    <Icon name="list" className="size-4" />
                  </span>
                  <span className="font-medium text-fg-base">{t(`mgmtReports.title.${type}`)}</span>
                </span>
                <a
                  href={`/api/management/export?type=${type}&format=csv`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-fg-base hover:bg-surface-hover"
                >
                  <Icon name="chevron" className="size-4 rotate-90" /> CSV
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-fg-subtle">{t("mgmtReports.exportNote")}</p>
    </>
  );
}
