import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { UserAvatar } from "@/components/common/user-avatar";
import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { RoleBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
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
import { getAdminStaffSummary, STAFF_ROLES } from "@/lib/services/page-summaries";
import { looksLikePhoneQuery, normalizeBdPhoneForSearch } from "@/lib/validation/server";
import type { Role } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.staffTitle") };
}

const BASE = "/admin/staff";
const SORTABLE = ["dateJoined", "firstName", "role"] as const;
const STATUSES = ["approved", "pending", "rejected"] as const;

/**
 * /admin/staff — staff directory: name, contact, photo, joining date, post.
 *
 * Paged, searched, filtered and sorted server-side. The summary cards use the
 * SAME role scope as the list (`STAFF_ROLES`), so no card can report a number
 * the directory below it would not show.
 */
export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { t, fmt } = await getT();
  await requireRole("super_admin");
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "dateJoined",
  });
  const role = enumParam(sp, "role", STAFF_ROLES);
  const status = enumParam(sp, "status", STATUSES);

  const where: Prisma.UserWhereInput = { role: { in: [...STAFF_ROLES] } };
  if (role) where.role = role;
  if (status) where.status = status;
  if (search) {
    const or: Prisma.UserWhereInput[] = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { username: { contains: search } },
      { email: { contains: search } },
    ];
    if (looksLikePhoneQuery(search)) {
      const digits = normalizeBdPhoneForSearch(search);
      if (digits) or.push({ phone: { contains: digits } });
    } else {
      or.push({ phone: { contains: search } });
    }
    where.OR = or;
  }

  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    sort === "firstName"
      ? [{ firstName: direction }]
      : sort === "role"
        ? [{ role: direction }, { firstName: "asc" }]
        : [{ dateJoined: direction }];

  const [total, staff, summary] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy, skip, take }),
    getAdminStaffSummary(),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "role", "status"]);

  const activeFilters = [
    ...(search
      ? [{ key: "search", label: t("list.searchLabel"), value: search, removeHref: listHref(BASE, sp, { search: undefined }) }]
      : []),
    ...(role
      ? [{ key: "role", label: t("common.role"), value: t(`roles.${role}`), removeHref: listHref(BASE, sp, { role: undefined }) }]
      : []),
    ...(status
      ? [{ key: "status", label: t("list.filterStatus"), value: t(`userStatus.${status}`), removeHref: listHref(BASE, sp, { status: undefined }) }]
      : []),
  ];

  const name = (s: (typeof staff)[number]) => `${s.firstName} ${s.lastName}`.trim() || s.username;

  const statusBadge = (value: string) => (
    <span
      className={
        value === "approved"
          ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25"
          : "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25"
      }
    >
      {t(`userStatus.${value}`)}
    </span>
  );

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/admin/dashboard" },
          { label: t("adminExtras.staffTitle") },
        ]}
        title={t("adminExtras.staffTitle")}
        subtitle={t("adminExtras.staffSub")}
      />

      <SummaryCardGrid>
        <SummaryCard title={t("adminExtras.staffTotal")} value={fmt.num(summary.total)} icon={<Icon name="users" />} />
        <SummaryCard
          title={t("adminExtras.activeLabel")}
          value={fmt.num(summary.active)}
          icon={<Icon name="check" />}
          accent="success"
          href={listHref(BASE, sp, { status: "approved" })}
        />
        <SummaryCard
          title={t("roles.branch_manager")}
          value={fmt.num(summary.managers)}
          icon={<Icon name="briefcase" />}
          accent="info"
          href={listHref(BASE, sp, { role: "branch_manager" })}
        />
        <SummaryCard
          title={t("roles.rider")}
          value={fmt.num(summary.riders)}
          icon={<Icon name="bike" />}
          accent="violet"
          href={listHref(BASE, sp, { role: "rider" })}
        />
        <SummaryCard
          title={t("adminExtras.staffUnassigned")}
          value={fmt.num(summary.withoutBranch)}
          icon={<Icon name="store" />}
          accent="warning"
        />
      </SummaryCardGrid>

      <FilterBar
        search={
          <ListSearch
            basePath={BASE}
            searchParams={sp}
            value={search}
            placeholder={t("list.searchStaff")}
            label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")}
            submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <>
            <ListFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="role"
              label={t("common.role")}
              value={role}
              applyLabel={t("list.apply")}
              options={[
                { value: "", label: t("list.filterAll") },
                ...STAFF_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) })),
              ]}
            />
            <ListFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="status"
              label={t("list.filterStatus")}
              value={status}
              applyLabel={t("list.apply")}
              options={[
                { value: "", label: t("list.filterAll") },
                ...STATUSES.map((s) => ({ value: s, label: t(`userStatus.${s}`) })),
              ]}
            />
          </>
        }
        activeFilters={activeFilters}
        clearHref={BASE}
        clearLabel={t("list.clearFilters")}
        resultsLabel={t("list.results", { total: fmt.num(meta.total) })}
      />

      <Card>
        {staff.length === 0 ? (
          filtered ? (
            <EmptyState
              title={t("list.noResultsTitle")}
              description={t("list.noResultsDesc")}
              action={
                <ButtonLink href={BASE} size="sm" variant="outline">
                  {t("list.clearFilters")}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState title={t("pages.noData")} />
          )
        ) : (
          <>
            <ResponsiveDataView
              items={staff}
              getKey={(s) => s.id}
              desktop={(rows) => (
                <Table
                  headers={[
                    t("adminExtras.colStaff"),
                    t("adminExtras.colContact"),
                    t("adminExtras.colPost"),
                    t("adminExtras.colJoined"),
                    t("pages.colStatus"),
                  ]}
                >
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-hover/70">
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={name(s)} photo={s.profilePhoto} className="size-9 text-xs" />
                          <span>
                            <span className="block font-medium text-fg-base">{name(s)}</span>
                            <span className="block text-xs text-fg-subtle">@{s.username}</span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-sm">{s.phone || "—"}</span>
                        <span className="block text-xs text-fg-subtle">{s.email}</span>
                      </Td>
                      <Td><RoleBadge role={s.role as Role} /></Td>
                      <Td>
                        <span className="text-xs text-fg-muted">{fmt.date(s.dateJoined.toISOString())}</span>
                      </Td>
                      <Td>{statusBadge(s.status)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(s) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start gap-2.5">
                    <UserAvatar name={name(s)} photo={s.profilePhoto} className="size-9 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg-base">{name(s)}</p>
                      <p className="truncate text-xs text-fg-subtle">@{s.username}</p>
                    </div>
                    {statusBadge(s.status)}
                  </div>
                  <dl className="mt-2.5 grid gap-1.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colPost")}</dt>
                      <dd><RoleBadge role={s.role as Role} /></dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colContact")}</dt>
                      <dd className="min-w-0 truncate text-right text-fg-base">{s.phone || s.email}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colJoined")}</dt>
                      <dd className="text-fg-base">{fmt.date(s.dateJoined.toISOString())}</dd>
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
                  from: fmt.num(meta.from),
                  to: fmt.num(meta.to),
                  total: fmt.num(meta.total),
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
