import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { CustomerBlockButton } from "@/components/admin/customer-block-button";
import { UserAvatar } from "@/components/common/user-avatar";
import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
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
import { getAdminCustomerSummary } from "@/lib/services/page-summaries";
import { looksLikePhoneQuery, normalizeBdPhoneForSearch } from "@/lib/validation/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.customersTitle") };
}

const BASE = "/admin/customers";
/** The ONLY fields that may reach Prisma's orderBy. */
const SORTABLE = ["dateJoined", "firstName", "orders"] as const;
const STATUSES = ["active", "blocked"] as const;

/**
 * /admin/customers — every customer account, with order stats + block control.
 *
 * The list is paged, searched, filtered and sorted on the SERVER: the browser
 * only ever receives one page of rows. The summary cards above it are separate
 * database aggregates over every customer, so they stay correct no matter which
 * page is being viewed.
 */
export default async function AdminCustomersPage({
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
  const status = enumParam(sp, "status", STATUSES);

  // Scope is fixed to customers — no query parameter can widen it.
  const where: Prisma.UserWhereInput = { role: "customer" };
  if (status === "blocked") where.isBlocked = true;
  if (status === "active") where.isBlocked = false;
  if (search) {
    const or: Prisma.UserWhereInput[] = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { username: { contains: search } },
      { email: { contains: search } },
    ];
    // A phone-shaped query is reduced to its national digits first, so
    // "+880 17…" finds the same customer as "017…".
    if (looksLikePhoneQuery(search)) {
      const digits = normalizeBdPhoneForSearch(search);
      if (digits) or.push({ phone: { contains: digits } });
    } else {
      or.push({ phone: { contains: search } });
    }
    where.OR = or;
  }

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "orders"
      ? { orders: { _count: direction } }
      : sort === "firstName"
        ? { firstName: direction }
        : { dateJoined: direction };

  const [total, customers, summary] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy,
      skip,
      take,
    }),
    getAdminCustomerSummary(),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "status"]);

  const activeFilters = [
    ...(search
      ? [{
          key: "search",
          label: t("list.searchLabel"),
          value: search,
          removeHref: listHref(BASE, sp, { search: undefined }),
        }]
      : []),
    ...(status
      ? [{
          key: "status",
          label: t("list.filterStatus"),
          value: status === "blocked" ? t("adminExtras.blocked") : t("adminExtras.activeLabel"),
          removeHref: listHref(BASE, sp, { status: undefined }),
        }]
      : []),
  ];

  const name = (c: (typeof customers)[number]) =>
    `${c.firstName} ${c.lastName}`.trim() || c.username;

  const statusBadge = (blocked: boolean) =>
    blocked ? (
      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25">
        {t("adminExtras.blocked")}
      </span>
    ) : (
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25">
        {t("adminExtras.activeLabel")}
      </span>
    );

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/admin/dashboard" },
          { label: t("adminExtras.customersTitle") },
        ]}
        title={t("adminExtras.customersTitle")}
        subtitle={t("adminExtras.customersSub")}
        actions={
          <ButtonLink href="/admin/customers/blocked" variant="outline">
            {t("adminExtras.viewBlocked")}
          </ButtonLink>
        }
      />

      {/* Aggregates over EVERY customer, not the rows on this page. The status
          cards link to the same `?status=` filter the dropdown sets. */}
      <SummaryCardGrid>
        <SummaryCard
          title={t("adminExtras.customersTitle")}
          value={fmt.num(summary.total)}
          icon={<Icon name="users" />}
        />
        <SummaryCard
          title={t("adminExtras.activeLabel")}
          value={fmt.num(summary.active)}
          icon={<Icon name="check" />}
          accent="success"
          href={listHref(BASE, sp, { status: "active" })}
        />
        <SummaryCard
          title={t("adminExtras.blocked")}
          value={fmt.num(summary.blocked)}
          icon={<Icon name="x" />}
          accent="danger"
          href={listHref(BASE, sp, { status: "blocked" })}
        />
        <SummaryCard
          title={t("adminExtras.customersWithOrders")}
          value={fmt.num(summary.withOrders)}
          icon={<Icon name="bag" />}
          accent="info"
        />
        <SummaryCard
          title={t("adminExtras.newThisMonth")}
          value={fmt.num(summary.newThisMonth)}
          icon={<Icon name="clock" />}
          accent="violet"
        />
      </SummaryCardGrid>

      <FilterBar
        search={
          <ListSearch
            basePath={BASE}
            searchParams={sp}
            value={search}
            placeholder={t("list.searchCustomers")}
            label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")}
            submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <ListFilterSelect
            basePath={BASE}
            searchParams={sp}
            name="status"
            label={t("list.filterStatus")}
            value={status}
            applyLabel={t("list.apply")}
            options={[
              { value: "", label: t("list.filterAll") },
              { value: "active", label: t("adminExtras.activeLabel") },
              { value: "blocked", label: t("adminExtras.blocked") },
            ]}
          />
        }
        activeFilters={activeFilters}
        clearHref={BASE}
        clearLabel={t("list.clearFilters")}
        resultsLabel={t("list.results", { total: fmt.num(meta.total) })}
      />

      <Card>
        {customers.length === 0 ? (
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
              items={customers}
              getKey={(c) => c.id}
              desktop={(rows) => (
                <Table
                  headers={[
                    t("adminExtras.colCustomer"),
                    t("adminExtras.colContact"),
                    t("adminExtras.colOrders"),
                    t("adminExtras.colJoined"),
                    t("pages.colStatus"),
                    t("pages.colActions"),
                  ]}
                >
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-hover/70">
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <UserAvatar name={name(c)} photo={c.profilePhoto} className="size-8 text-xs" />
                          <span>
                            <span className="block font-medium text-fg-base">{name(c)}</span>
                            <span className="block text-xs text-fg-subtle">@{c.username}</span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-sm">{c.phone || "—"}</span>
                        <span className="block text-xs text-fg-subtle">{c.email}</span>
                      </Td>
                      <Td>{fmt.num(c._count.orders)}</Td>
                      <Td>
                        <span className="text-xs text-fg-muted">{fmt.date(c.dateJoined.toISOString())}</span>
                      </Td>
                      <Td>{statusBadge(c.isBlocked)}</Td>
                      <Td className="text-right">
                        <CustomerBlockButton userId={c.id} isBlocked={c.isBlocked} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(c) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start gap-2.5">
                    <UserAvatar name={name(c)} photo={c.profilePhoto} className="size-9 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg-base">{name(c)}</p>
                      <p className="truncate text-xs text-fg-subtle">@{c.username}</p>
                    </div>
                    {statusBadge(c.isBlocked)}
                  </div>
                  <dl className="mt-2.5 grid gap-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colContact")}</dt>
                      <dd className="min-w-0 truncate text-right text-fg-base">{c.phone || c.email}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colOrders")}</dt>
                      <dd className="font-medium text-fg-base">{fmt.num(c._count.orders)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs text-fg-muted">{t("adminExtras.colJoined")}</dt>
                      <dd className="text-fg-base">{fmt.date(c.dateJoined.toISOString())}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end">
                    <CustomerBlockButton userId={c.id} isBlocked={c.isBlocked} />
                  </div>
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
