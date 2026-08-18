import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { OrderTable } from "@/components/orders/order-table";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireApiUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  dateParam,
  enumParam,
  hasActiveFilters,
  listHref,
  pageMeta,
  param,
  parseListParams,
  type RawSearchParams,
} from "@/lib/http/list-params";
import { getT } from "@/lib/i18n/server";
import { ORDER_INCLUDE, ordersWhereForUser } from "@/lib/selectors";
import { serializeOrder } from "@/lib/serializers";
import { getOrderListSummary } from "@/lib/services/page-summaries";
import { looksLikePhoneQuery, normalizeBdPhoneForSearch } from "@/lib/validation/server";
import type { Order } from "@/types";

export const metadata: Metadata = { title: "Orders" };

const BASE = "/admin/orders";
const SORTABLE = ["createdAt", "totalAmount", "orderNumber"] as const;
const ORDER_STATUSES = [
  "pending", "accepted", "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled",
] as const;
const PAYMENT_METHODS = ["cash", "bkash"] as const;

/**
 * /admin/orders — super admin read-only view of every order across all branches.
 *
 * This used to fetch 100 orders in one request and render every one. It now
 * queries Prisma through `ordersWhereForUser()` — the SAME scope selector the
 * orders API uses, so RBAC is unchanged — and pages, searches, filters and
 * sorts on the server. The browser only ever receives one page of rows.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const me = await requireApiUser();
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "createdAt",
  });
  const status = enumParam(sp, "status", ORDER_STATUSES);
  const method = enumParam(sp, "method", PAYMENT_METHODS);
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  const branchRaw = Number.parseInt(param(sp, "branch"), 10);
  const branch = Number.isSafeInteger(branchRaw) && branchRaw > 0 ? branchRaw : 0;

  // The role's own scope is the base; a filter may only NARROW it.
  const scope = await ordersWhereForUser(me);
  const where: Prisma.OrderWhereInput = { ...(scope ?? {}) };
  if (status) where.status = status;
  if (method) where.paymentMethod = method;
  if (branch) where.branchId = branch;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }
  if (search) {
    const or: Prisma.OrderWhereInput[] = [
      { orderNumber: { contains: search } },
      { customer: { firstName: { contains: search } } },
      { customer: { lastName: { contains: search } } },
    ];
    if (looksLikePhoneQuery(search)) {
      const digits = normalizeBdPhoneForSearch(search);
      if (digits) or.push({ customer: { phone: { contains: digits } } });
    }
    where.OR = or;
  }

  const orderBy: Prisma.OrderOrderByWithRelationInput =
    sort === "totalAmount"
      ? { totalAmount: direction }
      : sort === "orderNumber"
        ? { orderNumber: direction }
        : { createdAt: direction };

  const [total, rows, summary, branches] = await Promise.all([
    scope === null ? Promise.resolve(0) : prisma.order.count({ where }),
    scope === null
      ? Promise.resolve([])
      : prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy, skip, take }),
    getOrderListSummary(me),
    prisma.branch.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // `serializeOrder` widens the status column to `string`; going through the
  // API this same value is narrowed on JSON parse. Asserting here keeps the
  // rendered shape identical to what the API route returns.
  const orders = rows.map(serializeOrder) as unknown as Order[];
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "status", "method", "branch", "from", "to"]);

  const chip = (key: string, label: string, value: string) => ({
    key,
    label,
    value,
    removeHref: listHref(BASE, sp, { [key]: undefined }),
  });
  const activeFilters = [
    ...(search ? [chip("search", t("list.searchLabel"), search)] : []),
    ...(status ? [chip("status", t("list.filterStatus"), t(`orderStatus.${status}`))] : []),
    ...(method ? [chip("method", t("pages.colMethod"), t(`payment.${method}`))] : []),
    ...(branch
      ? [chip("branch", t("list.filterBranch"), branches.find((b) => b.id === branch)?.name ?? String(branch))]
      : []),
    ...(from ? [chip("from", t("wallet.filterFrom"), from)] : []),
    ...(to ? [chip("to", t("wallet.filterTo"), to)] : []),
  ];

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/admin/dashboard" },
          { label: t("pages.ordersTitle") },
        ]}
        title={t("pages.ordersTitle")}
        subtitle={t("pages.ordersSub")}
      />

      {/* Database aggregates across the whole authorized scope — these do not
          change as you page through the list. Each links to its own filter. */}
      <SummaryCardGrid>
        <SummaryCard title={t("common.total")} value={fmt.num(summary.total)} icon={<Icon name="bag" />} />
        <SummaryCard title={t("orderStatus.pending")} value={fmt.num(summary.pending)} icon={<Icon name="clock" />} accent="warning" href={listHref(BASE, sp, { status: "pending" })} />
        <SummaryCard title={t("orderStatus.preparing")} value={fmt.num(summary.preparing)} icon={<Icon name="bolt" />} accent="info" href={listHref(BASE, sp, { status: "preparing" })} />
        <SummaryCard title={t("orderStatus.ready")} value={fmt.num(summary.ready)} icon={<Icon name="check" />} accent="violet" href={listHref(BASE, sp, { status: "ready" })} />
        <SummaryCard title={t("orderStatus.on_the_way")} value={fmt.num(summary.on_the_way)} icon={<Icon name="bike" />} accent="brand" href={listHref(BASE, sp, { status: "on_the_way" })} />
        <SummaryCard title={t("orderStatus.delivered")} value={fmt.num(summary.delivered)} icon={<Icon name="check" />} accent="success" href={listHref(BASE, sp, { status: "delivered" })} />
        <SummaryCard title={t("orderStatus.cancelled")} value={fmt.num(summary.cancelled)} icon={<Icon name="x" />} accent="danger" href={listHref(BASE, sp, { status: "cancelled" })} />
      </SummaryCardGrid>

      <FilterBar
        search={
          <ListSearch
            basePath={BASE}
            searchParams={sp}
            value={search}
            placeholder={t("list.searchOrders")}
            label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")}
            submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <>
            <ListFilterSelect
              basePath={BASE} searchParams={sp} name="status" label={t("list.filterStatus")}
              value={status} applyLabel={t("list.apply")}
              options={[
                { value: "", label: t("list.filterAll") },
                ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`orderStatus.${s}`) })),
              ]}
            />
            <ListFilterSelect
              basePath={BASE} searchParams={sp} name="branch" label={t("list.filterBranch")}
              value={branch ? String(branch) : ""} applyLabel={t("list.apply")}
              options={[
                { value: "", label: t("list.filterAll") },
                ...branches.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
            <ListFilterSelect
              basePath={BASE} searchParams={sp} name="method" label={t("pages.colMethod")}
              value={method} applyLabel={t("list.apply")}
              options={[
                { value: "", label: t("list.filterAll") },
                ...PAYMENT_METHODS.map((m) => ({ value: m, label: t(`payment.${m}`) })),
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
        {orders.length === 0 && filtered ? (
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
          <>
            <OrderTable orders={orders} hrefBase="/admin/orders" showBranch />
            {orders.length > 0 ? (
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
            ) : null}
          </>
        )}
      </Card>
    </DashboardPage>
  );
}
