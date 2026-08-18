import type { Metadata } from "next";
import Link from "next/link";

import { BranchRowDelete } from "@/components/branches/branch-row-delete";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  enumParam,
  hasActiveFilters,
  listHref,
  pageMeta,
  parseListParams,
  type RawSearchParams,
} from "@/lib/http/list-params";
import { getT } from "@/lib/i18n/server";
import { getAdminBranchSummary } from "@/lib/services/page-summaries";
import { looksLikePhoneQuery, normalizeBdPhoneForSearch } from "@/lib/validation/server";
import type { Prisma } from "@prisma/client";

const BASE = "/admin/branches";
const SORTABLE = ["name", "createdAt"] as const;
const STATES = ["active", "inactive", "archived", "unassigned"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("branches.title") };
}

export default async function BranchListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const sp = await searchParams;
  const result = typeof sp.result === "string" ? sp.result : undefined;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "name",
    defaultDirection: "asc",
  });
  const state = enumParam(sp, "state", STATES);

  // Super admin scope is every branch; the state filter only narrows it.
  const where: Prisma.BranchWhereInput = {};
  if (state === "active") { where.isActive = true; where.isArchived = false; }
  if (state === "inactive") { where.isActive = false; where.isArchived = false; }
  if (state === "archived") where.isArchived = true;
  if (state === "unassigned") { where.managerId = null; where.isArchived = false; }
  if (search) {
    const or: Prisma.BranchWhereInput[] = [
      { name: { contains: search } },
      { address: { contains: search } },
      { manager: { firstName: { contains: search } } },
      { manager: { lastName: { contains: search } } },
    ];
    if (looksLikePhoneQuery(search)) {
      const digits = normalizeBdPhoneForSearch(search);
      if (digits) or.push({ phone: { contains: digits } });
    } else {
      or.push({ phone: { contains: search } });
    }
    where.OR = or;
  }

  const [total, rows, summary] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({
      where,
      include: { manager: true },
      orderBy: sort === "createdAt" ? { createdAt: direction } : { name: direction },
      skip,
      take,
    }),
    getAdminBranchSummary(),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "state"]);

  // Shaped to match what the table already renders.
  const data = {
    results: rows.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      brand_type: b.brandType,
      is_active: b.isActive,
      is_archived: b.isArchived,
      delivery_radius_km: String(b.deliveryRadiusKm),
      manager_name: b.manager
        ? `${b.manager.firstName} ${b.manager.lastName}`.trim() || b.manager.username
        : null,
    })),
  };

  return (
    <>
      <PageHeader
        title={t("branches.title")}
        subtitle={t("branches.subtitle")}
        action={<ButtonLink href="/admin/branches/create">+ {t("branches.newBranch")}</ButtonLink>}
      />
      <SummaryCardGrid className="mb-5">
        <SummaryCard title={t("superAdmin.totalBranches")} value={fmt.num(summary.total)} icon={<Icon name="store" />} />
        <SummaryCard title={t("superAdmin.activeBranches")} value={fmt.num(summary.active)} icon={<Icon name="check" />} accent="success" />
        <SummaryCard title={t("branches.archivedBadge")} value={fmt.num(summary.archived)} icon={<Icon name="history" />} accent="neutral" />
        <SummaryCard title={t("common.notAssigned")} value={fmt.num(summary.unassigned)} icon={<Icon name="users" />} accent="warning" />
      </SummaryCardGrid>
      {result === "archived" ? <Alert tone="success" message={t("branches.archivedResult")} /> : null}
      {result === "deleted" ? <Alert tone="success" message={t("branches.deletedResult")} /> : null}

      <FilterBar
        className="mb-5"
        search={
          <ListSearch
            basePath={BASE} searchParams={sp} value={search}
            placeholder={t("list.searchBranches")} label={t("list.searchLabel")}
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
              { value: "inactive", label: t("common.inactive") },
              { value: "archived", label: t("branches.archivedBadge") },
              { value: "unassigned", label: t("common.notAssigned") },
            ]}
          />
        }
        activeFilters={[
          ...(search ? [{ key: "search", label: t("list.searchLabel"), value: search, removeHref: listHref(BASE, sp, { search: undefined }) }] : []),
          ...(state ? [{ key: "state", label: t("list.filterStatus"), value: state, removeHref: listHref(BASE, sp, { state: undefined }) }] : []),
        ]}
        clearHref={BASE}
        clearLabel={t("list.clearFilters")}
        resultsLabel={t("list.results", { total: fmt.num(meta.total) })}
      />

      <Card>
        {data.results.length === 0 ? (
          filtered ? (
            <EmptyState
              title={t("list.noResultsTitle")}
              description={t("list.noResultsDesc")}
              action={<ButtonLink href={BASE} variant="outline">{t("list.clearFilters")}</ButtonLink>}
            />
          ) : (
            <EmptyState
              title={t("branches.emptyTitle")}
              description={t("branches.emptyDesc")}
              action={<ButtonLink href="/admin/branches/create">{t("branches.createBranch")}</ButtonLink>}
            />
          )
        ) : (
          <Table headers={[t("branches.branch"), t("common.phone"), t("branches.manager"), t("branches.deliveryRadius"), t("common.status"), ""]}>
            {data.results.map((branch) => (
              <tr key={branch.id} className="hover:bg-surface-hover/70">
                <Td>
                  <Link href={`/admin/branches/${branch.id}`} className="font-semibold text-fg-base hover:text-brand-600">
                    {branch.name}
                  </Link>
                  <span className="mt-0.5 block">
                    <Badge tone="blue">{t(`brands.${branch.brand_type ?? "combined"}`)}</Badge>
                  </span>
                  <span className="block max-w-56 truncate text-xs text-fg-subtle">{branch.address}</span>
                </Td>
                <Td>{branch.phone}</Td>
                <Td>{branch.manager_name ?? <span className="text-fg-subtle">{t("common.notAssigned")}</span>}</Td>
                <Td>{fmt.num(branch.delivery_radius_km)} {t("branches.km")}</Td>
                {/* An archived branch is not merely inactive — its history is
                    preserved and it can never take new orders, so it is labelled
                    distinctly once the delete/archive action has run. */}
                <Td>
                  {branch.is_archived ? (
                    <Badge tone="slate">{t("branches.archivedBadge")}</Badge>
                  ) : branch.is_active ? (
                    <Badge tone="green">{t("common.active")}</Badge>
                  ) : (
                    <Badge tone="red">{t("common.inactive")}</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <span className="flex items-center justify-end gap-3 text-sm font-medium">
                    <Link href={`/admin/branches/${branch.id}`} className="text-fg-muted hover:underline">{t("common.view")}</Link>
                    <Link href={`/admin/branches/${branch.id}/edit`} className="text-brand-600 hover:underline">{t("common.edit")}</Link>
                    {/* req #1 — row-level delete; the server decides delete vs archive. */}
                    <BranchRowDelete branchId={branch.id} branchName={branch.name} />
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {data.results.length > 0 ? (
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
        ) : null}
      </Card>
    </>
  );
}
