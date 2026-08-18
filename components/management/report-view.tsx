import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { Icon } from "@/components/layout/icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getT } from "@/lib/i18n/server";
import { buildReport, type ManagementReportType } from "@/lib/services/management";

/** Shared management report table (used by every /management/reports/* page). */
export async function ManagementReportView({ type }: { type: ManagementReportType }) {
  const { t } = await getT();
  const report = await buildReport(type);
  const labels = report.columns.map((c) => t(`mgmtReports.col.${c}`));

  // finance/orders rows carry i18n metric/status keys in col 0 → localize them.
  const localizeCell = (value: string | number, col: number): string => {
    if (col !== 0) return String(value);
    if (type === "finance") return t(`mgmtReports.metric.${value}`);
    if (type === "orders") return t(`orderStatus.${value}`);
    return String(value);
  };

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("mgmtReports.backToHub"), href: "/management/reports" },
          { label: t(`mgmtReports.title.${report.key}`) },
        ]}
        title={t(`mgmtReports.title.${report.key}`)}
        subtitle={t(`mgmtReports.sub.${report.key}`)}
        actions={
          <a
            href={`/api/management/export?type=${type}&format=csv`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border-strong bg-surface-card px-4 text-sm font-medium text-fg-base hover:bg-surface-hover"
          >
            <Icon name="list" className="size-4" /> {t("mgmtReports.exportCsv")}
          </a>
        }
      />
      <Card>
        {report.rows.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          /* A report row is a plain string tuple, so below `md` each row becomes
             a labelled key/value card instead of a table forced into ~360px. */
          <ResponsiveDataView
            items={report.rows}
            getKey={(row) => report.rows.indexOf(row)}
            desktop={(rows) => (
              <Table headers={labels}>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-hover/70">
                    {row.map((cell, j) => (
                      <Td key={j}>
                        <span className={j === 0 ? "font-medium text-fg-base" : ""}>
                          {localizeCell(cell, j)}
                        </span>
                      </Td>
                    ))}
                  </tr>
                ))}
              </Table>
            )}
            mobile={(row) => (
              <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                <p className="mb-2 font-semibold text-fg-base">{localizeCell(row[0], 0)}</p>
                <dl className="grid gap-1.5">
                  {row.slice(1).map((cell, j) => (
                    <div key={j} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{labels[j + 1]}</dt>
                      <dd className="text-sm font-medium text-fg-base">{localizeCell(cell, j + 1)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          />
        )}
      </Card>
    </DashboardPage>
  );
}
