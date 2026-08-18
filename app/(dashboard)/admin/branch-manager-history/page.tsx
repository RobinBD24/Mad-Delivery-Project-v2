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
import { getManagerAssignmentSummary } from "@/lib/services/page-summaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.historyTitle") };
}

const BASE = "/admin/branch-manager-history";
const SORTABLE = ["assignedAt", "relievedAt"] as const;
const STATES = ["active", "completed"] as const;

/** Whole days between two instants (the value the API's serializer reports). */
function durationDays(from: Date, to: Date | null): number {
  const end = to ?? new Date();
  return Math.max(0, Math.floor((end.getTime() - from.getTime()) / 86_400_000));
}

/**
 * /admin/branch-manager-history — who managed which branch, and when.
 *
 * Queried directly so the list can be searched and filtered; the scope matches
 * the API's (super admin sees every assignment) and the route is already
 * super-admin only.
 */
export default async function ManagerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "assignedAt",
  });
  const state = enumParam(sp, "state", STATES);
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");

  const where: Prisma.BranchManagerAssignmentWhereInput = {};
  // `relievedAt: null` is the schema's marker for a currently-active posting.
  if (state === "active") where.relievedAt = null;
  if (state === "completed") where.relievedAt = { not: null };
  if (from || to) {
    where.assignedAt = {
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
    ];
  }

  const orderBy: Prisma.BranchManagerAssignmentOrderByWithRelationInput =
    sort === "relievedAt" ? { relievedAt: direction } : { assignedAt: direction };

  const [total, rows, summary] = await Promise.all([
    prisma.branchManagerAssignment.count({ where }),
    prisma.branchManagerAssignment.findMany({
      where,
      include: { manager: true, branch: true, assignedBy: true },
      orderBy,
      skip,
      take,
    }),
    getManagerAssignmentSummary(),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "state", "from", "to"]);

  const chip = (key: string, label: string, value: string) => ({
    key, label, value, removeHref: listHref(BASE, sp, { [key]: undefined }),
  });
  const activeFilters = [
    ...(search ? [chip("search", t("list.searchLabel"), search)] : []),
    ...(state ? [chip("state", t("list.filterStatus"), state === "active" ? t("common.active") : t("users.completed"))] : []),
    ...(from ? [chip("from", t("wallet.filterFrom"), from)] : []),
    ...(to ? [chip("to", t("wallet.filterTo"), to)] : []),
  ];

  const managerName = (a: (typeof rows)[number]) =>
    `${a.manager.firstName} ${a.manager.lastName}`.trim() || a.manager.username;
  const stateBadge = (active: boolean) =>
    active ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="slate">{t("users.completed")}</Badge>;

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/admin/dashboard" },
          { label: t("users.historyTitle") },
        ]}
        title={t("users.historyTitle")}
        subtitle={t("users.historySubtitle")}
      />

      <SummaryCardGrid>
        <SummaryCard title={t("adminExtras.assignmentsTotal")} value={fmt.num(summary.total)} icon={<Icon name="history" />} />
        <SummaryCard title={t("adminExtras.assignmentsActive")} value={fmt.num(summary.active)} icon={<Icon name="check" />} accent="success" href={listHref(BASE, sp, { state: "active" })} />
        <SummaryCard title={t("adminExtras.assignmentsCompleted")} value={fmt.num(summary.completed)} icon={<Icon name="clock" />} accent="neutral" href={listHref(BASE, sp, { state: "completed" })} />
        <SummaryCard title={t("roles.branch_manager")} value={fmt.num(summary.activeManagers)} icon={<Icon name="users" />} accent="info" />
        <SummaryCard title={t("common.notAssigned")} value={fmt.num(summary.branchesWithoutManager)} icon={<Icon name="store" />} accent="warning" />
      </SummaryCardGrid>

      <FilterBar
        search={
          <ListSearch
            basePath={BASE} searchParams={sp} value={search}
            placeholder={t("list.searchManagers")} label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")} submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <ListFilterSelect
            basePath={BASE} searchParams={sp} name="state" label={t("list.filterStatus")}
            value={state} applyLabel={t("list.apply")}
            options={[
              { value: "", label: t("list.filterAll") },
              { value: "active", label: t("common.active") },
              { value: "completed", label: t("users.completed") },
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
            <EmptyState title={t("users.noHistory")} description={t("users.noHistoryDesc")} />
          )
        ) : (
          <>
            <ResponsiveDataView
              items={rows}
              getKey={(a) => a.id}
              desktop={(items) => (
                <Table headers={[t("users.manager"), t("users.branch"), t("users.start"), t("users.end"), t("users.duration"), t("users.assignedBy"), t("common.status")]}>
                  {items.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-hover/70">
                      <Td><span className="font-medium text-fg-base">{managerName(a)}</span></Td>
                      <Td>{a.branch.name}</Td>
                      <Td><span className="text-xs text-fg-muted">{fmt.dateTime(a.assignedAt.toISOString())}</span></Td>
                      <Td><span className="text-xs text-fg-muted">{a.relievedAt ? fmt.dateTime(a.relievedAt.toISOString()) : "—"}</span></Td>
                      <Td>{fmt.num(durationDays(a.assignedAt, a.relievedAt))} {t("users.days")}</Td>
                      <Td>{a.assignedBy ? `${a.assignedBy.firstName} ${a.assignedBy.lastName}`.trim() || a.assignedBy.username : "—"}</Td>
                      <Td>{stateBadge(a.relievedAt === null)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(a) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg-base">{managerName(a)}</p>
                      <p className="truncate text-xs text-fg-subtle">{a.branch.name}</p>
                    </div>
                    {stateBadge(a.relievedAt === null)}
                  </div>
                  <dl className="mt-2.5 grid gap-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("users.start")}</dt>
                      <dd className="text-fg-base">{fmt.dateTime(a.assignedAt.toISOString())}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("users.end")}</dt>
                      <dd className="text-fg-base">{a.relievedAt ? fmt.dateTime(a.relievedAt.toISOString()) : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("users.duration")}</dt>
                      <dd className="font-medium text-fg-base">{fmt.num(durationDays(a.assignedAt, a.relievedAt))} {t("users.days")}</dd>
                    </div>
                  </dl>
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
