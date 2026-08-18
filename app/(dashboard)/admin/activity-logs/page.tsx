import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  dateParam,
  enumParam,
  hasActiveFilters,
  listHref,
  pageMeta,
  parseListParams,
  type RawSearchParams,
} from "@/lib/http/list-params";
import { getT } from "@/lib/i18n/server";
import { getActivityLogSummary } from "@/lib/services/page-summaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.activityTitle") };
}

const BASE = "/admin/activity-logs";
const SORTABLE = ["timestamp"] as const;
/** Exactly the activity types the data records — nothing invented. */
const TYPES = ["login", "logout", "action"] as const;
const TYPE_TONES = { login: "green", logout: "slate", action: "blue" } as const;

/** /admin/activity-logs — manager activity trail, searchable, filterable, paged. */
export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "timestamp",
  });
  const type = enumParam(sp, "type", TYPES);
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");

  const where: Prisma.ManagerActivityLogWhereInput = {};
  if (type) where.activityType = type;
  if (from || to) {
    where.timestamp = {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { manager: { firstName: { contains: search } } },
      { manager: { lastName: { contains: search } } },
      { manager: { username: { contains: search } } },
      { branch: { name: { contains: search } } },
      { description: { contains: search } },
    ];
  }

  const [total, rows, summary] = await Promise.all([
    prisma.managerActivityLog.count({ where }),
    prisma.managerActivityLog.findMany({
      where,
      include: { manager: true, branch: true },
      orderBy: { timestamp: direction },
      skip,
      take,
    }),
    getActivityLogSummary(),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "type", "from", "to"]);

  const chip = (key: string, label: string, value: string) => ({
    key, label, value, removeHref: listHref(BASE, sp, { [key]: undefined }),
  });
  const activeFilters = [
    ...(search ? [chip("search", t("list.searchLabel"), search)] : []),
    ...(type ? [chip("type", t("users.type"), t(`activityType.${type}`))] : []),
    ...(from ? [chip("from", t("wallet.filterFrom"), from)] : []),
    ...(to ? [chip("to", t("wallet.filterTo"), to)] : []),
  ];

  const managerName = (log: (typeof rows)[number]) =>
    `${log.manager.firstName} ${log.manager.lastName}`.trim() || log.manager.username;
  const typeBadge = (value: string) => (
    <Badge tone={TYPE_TONES[value as keyof typeof TYPE_TONES] ?? "slate"}>
      {t(`activityType.${value}`)}
    </Badge>
  );

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/admin/dashboard" },
          { label: t("users.activityTitle") },
        ]}
        title={t("users.activityTitle")}
        subtitle={t("users.activitySubtitle")}
      />

      <SummaryCardGrid>
        <SummaryCard title={t("adminExtras.activitiesTotal")} value={fmt.num(summary.total)} icon={<Icon name="history" />} />
        <SummaryCard title={t("adminExtras.activitiesToday")} value={fmt.num(summary.today)} icon={<Icon name="clock" />} accent="info" />
        <SummaryCard title={t("activityType.login")} value={fmt.num(summary.login)} icon={<Icon name="user" />} accent="success" href={listHref(BASE, sp, { type: "login" })} />
        <SummaryCard title={t("activityType.logout")} value={fmt.num(summary.logout)} icon={<Icon name="logout" />} accent="neutral" href={listHref(BASE, sp, { type: "logout" })} />
        <SummaryCard title={t("activityType.action")} value={fmt.num(summary.action)} icon={<Icon name="bolt" />} accent="violet" href={listHref(BASE, sp, { type: "action" })} />
      </SummaryCardGrid>

      <FilterBar
        search={
          <ListSearch
            basePath={BASE} searchParams={sp} value={search}
            placeholder={t("list.searchActivity")} label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")} submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <ListFilterSelect
            basePath={BASE} searchParams={sp} name="type" label={t("users.type")}
            value={type} applyLabel={t("list.apply")}
            options={[
              { value: "", label: t("list.filterAll") },
              ...TYPES.map((v) => ({ value: v, label: t(`activityType.${v}`) })),
            ]}
          />
        }
        activeFilters={activeFilters}
        clearHref={BASE}
        clearLabel={t("list.clearFilters")}
        resultsLabel={t("list.results", { total: fmt.num(meta.total) })}
      />

      <Card>
        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title={t("list.noResultsTitle")}
              description={t("list.noResultsDesc")}
              action={<ButtonLink href={BASE} size="sm" variant="outline">{t("list.clearFilters")}</ButtonLink>}
            />
          ) : (
            <EmptyState title={t("users.noLogs")} description={t("users.noLogsDesc")} />
          )
        ) : (
          <>
            <ResponsiveDataView
              items={rows}
              getKey={(log) => log.id}
              desktop={(items) => (
                <Table headers={[t("users.time"), t("users.manager"), t("users.branch"), t("users.type"), t("users.description"), "IP"]}>
                  {items.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-hover/70">
                      <Td><span className="whitespace-nowrap text-xs text-fg-muted">{fmt.dateTime(log.timestamp.toISOString())}</span></Td>
                      <Td><span className="font-medium text-fg-base">{managerName(log)}</span></Td>
                      <Td>{log.branch?.name || "—"}</Td>
                      <Td>{typeBadge(log.activityType)}</Td>
                      <Td><span className="text-xs">{log.description}</span></Td>
                      <Td><span className="font-mono text-xs text-fg-muted">{log.ipAddress || "—"}</span></Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(log) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg-base">{managerName(log)}</p>
                      <p className="truncate text-xs text-fg-subtle">{log.branch?.name || "—"}</p>
                    </div>
                    {typeBadge(log.activityType)}
                  </div>
                  <p className="mt-2 break-words text-sm text-fg-base">{log.description}</p>
                  <p className="mt-1.5 text-xs text-fg-muted">{fmt.dateTime(log.timestamp.toISOString())}</p>
                </div>
              )}
            />
            <ListPagination
              basePath={BASE}
              searchParams={sp}
              meta={meta}
              labels={{
                showing: t("list.showing", {
                  from: fmt.num(meta.from), to: fmt.num(meta.to), total: fmt.num(meta.total),
                }),
                previous: t("list.previous"),
                next: t("list.next"),
                pagination: t("list.pagination"),
              }}
            />
          </>
        )}
      </Card>
    </DashboardPage>
  );
}
