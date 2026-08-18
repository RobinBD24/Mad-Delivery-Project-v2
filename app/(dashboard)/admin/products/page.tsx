import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { InstantFilterSelect, InstantSearch } from "@/components/dashboard/instant-list-controls";
import { ListPagination } from "@/components/dashboard/list-controls";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { ProductRowActions } from "@/components/catalog/product-row-actions";
import { Icon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { PRODUCT_BRANDS, PRODUCT_VARIATION_TYPES } from "@/lib/constants/enums";
import { prisma } from "@/lib/db";
import {
  enumParam,
  hasActiveFilters,
  listHref,
  pageMeta,
  param,
  parseListParams,
  PRODUCTS_PAGE_SIZE,
  type RawSearchParams,
} from "@/lib/http/list-params";
import { getT } from "@/lib/i18n/server";
import { getAdminProductSummary } from "@/lib/services/page-summaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.productsTitle") };
}

const BASE = "/admin/products";
/** The ONLY sortable fields — an arbitrary query string never reaches orderBy. */
const SORTABLE = ["name", "price", "createdAt", "updatedAt"] as const;
const STATUSES = ["available", "deactivated", "held"] as const;

/** Numeric query param, ignored unless it is a positive integer. */
function idParam(sp: RawSearchParams, key: string): number | undefined {
  const raw = Number.parseInt(param(sp, key), 10);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;
}

/**
 * /admin/products — every product across every branch.
 *
 * Server-side search, filtering, sorting and 15-per-page pagination. Filters and
 * search apply INSTANTLY — the controls are the client `InstantSearch` /
 * `InstantFilterSelect`, which rewrite the URL with `router.replace`; the query
 * below still runs on the server, so nothing is filtered in the browser.
 * Summary cards count the FULL dataset, not the visible page.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "name",
    defaultDirection: "asc",
    defaultPageSize: PRODUCTS_PAGE_SIZE,
  });
  const branchId = idParam(sp, "branch");
  const categoryId = idParam(sp, "category");
  const brand = enumParam(sp, "brand", PRODUCT_BRANDS);
  const status = enumParam(sp, "status", STATUSES);
  const variationType = enumParam(sp, "variationType", PRODUCT_VARIATION_TYPES);

  // Soft-deleted products have their own page (/admin/products/deactivated), so
  // they stay excluded here exactly as before.
  const and: Prisma.ProductWhereInput[] = [{ deletedAt: null }];
  if (branchId) and.push({ branchId });
  if (categoryId) and.push({ categoryId });
  if (brand) and.push({ brand });
  if (variationType) and.push({ variationType });
  if (status === "held") and.push({ heldByAdmin: true });
  if (status === "available") and.push({ isAvailable: true, heldByAdmin: false });
  if (status === "deactivated") and.push({ isAvailable: false, heldByAdmin: false });
  if (search) {
    // Name/description plus the related branch, category and brand — the things
    // an admin actually knows a product by.
    and.push({
      OR: [
        { name: { contains: search } },
        { description: { contains: search } },
        { brand: { contains: search } },
        { branch: { name: { contains: search } } },
        { category: { name: { contains: search } } },
      ],
    });
  }
  const where: Prisma.ProductWhereInput = { AND: and };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "price"
      ? { price: direction }
      : sort === "createdAt"
        ? { createdAt: direction }
        : sort === "updatedAt"
          ? { updatedAt: direction }
          : { name: direction };

  const [total, products, summary, branches, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
      orderBy,
      skip,
      take,
    }),
    getAdminProductSummary(),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // An out-of-range page normalises instead of rendering an empty table. This is
  // reachable without a crafted URL: deleting or deactivating the last row of the
  // final page shrinks the result set under the page the admin is standing on.
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && page > lastPage) {
    redirect(listHref(BASE, sp, { page: lastPage }));
  }

  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, [
    "search",
    "branch",
    "category",
    "brand",
    "status",
    "variationType",
  ]);

  const chip = (key: string, label: string, value: string) => ({
    key,
    label,
    value,
    removeHref: listHref(BASE, sp, { [key]: undefined }),
  });
  const statusLabel = (value: string) =>
    value === "held"
      ? t("adminExtras.heldBadge")
      : value === "available"
        ? t("adminExtras.availableBadge")
        : t("adminExtras.deactivatedBadge");
  const activeFilters = [
    ...(search ? [chip("search", t("list.searchLabel"), search)] : []),
    ...(branchId
      ? [chip("branch", t("pages.colBranch"), branches.find((b) => b.id === branchId)?.name ?? String(branchId))]
      : []),
    ...(categoryId
      ? [chip("category", t("adminExtras.colCategory"), categories.find((c) => c.id === categoryId)?.name ?? String(categoryId))]
      : []),
    ...(brand ? [chip("brand", t("catalog.brand"), t(`brands.${brand}`))] : []),
    ...(status ? [chip("status", t("pages.colStatus"), statusLabel(status))] : []),
    ...(variationType ? [chip("variationType", t("variationType.label"), t(`variationType.${variationType}`))] : []),
  ];

  const statusBadge = (p: (typeof products)[number]) =>
    p.heldByAdmin ? (
      <Badge tone="red">{t("adminExtras.heldBadge")}</Badge>
    ) : p.isAvailable ? (
      <Badge tone="green">{t("adminExtras.availableBadge")}</Badge>
    ) : (
      <Badge tone="amber">{t("adminExtras.deactivatedBadge")}</Badge>
    );

  const basePriceOf = (p: (typeof products)[number]) => {
    const enabled = p.variations.filter((v) => v.isEnabled);
    const def = enabled.find((v) => v.isDefault) ?? enabled[0];
    return (def ? def.price : p.price).toString();
  };

  const actionsFor = (p: (typeof products)[number]) => (
    <ProductRowActions
      productId={p.id}
      productName={p.name}
      branchName={p.branch.name}
      isAvailable={p.isAvailable}
      heldByAdmin={p.heldByAdmin}
      basePath={BASE}
      canHold
      canDelete
    />
  );

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        title={t("adminExtras.productsTitle")}
        subtitle={t("adminExtras.productsSub")}
        actions={
          <span className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/products/deactivated" variant="outline">
              {t("adminExtras.viewDeactivated")}
            </ButtonLink>
            <ButtonLink href="/admin/products/create">{t("catalog.addProduct")}</ButtonLink>
          </span>
        }
      />

      {/* Counts span the whole authorized dataset, not the visible page. Each
          card links to the filter that isolates it. */}
      <SummaryCardGrid>
        <SummaryCard
          title={t("branchManager.kpiTotalProducts")}
          value={fmt.num(summary.total)}
          icon={<Icon name="grid" />}
          href={listHref(BASE, sp, { status: undefined, page: undefined })}
        />
        <SummaryCard
          title={t("adminExtras.availableBadge")}
          value={fmt.num(summary.available)}
          icon={<Icon name="check" />}
          accent="success"
          href={listHref(BASE, sp, { status: "available", page: undefined })}
        />
        <SummaryCard
          title={t("adminExtras.heldBadge")}
          value={fmt.num(summary.held)}
          icon={<Icon name="lock" />}
          accent="danger"
          href={listHref(BASE, sp, { status: "held", page: undefined })}
        />
        <SummaryCard
          title={t("adminExtras.deactivatedBadge")}
          value={fmt.num(summary.unavailable)}
          icon={<Icon name="x" />}
          accent="warning"
          href={listHref(BASE, sp, { status: "deactivated", page: undefined })}
        />
      </SummaryCardGrid>

      <FilterBar
        search={
          <InstantSearch
            basePath={BASE}
            searchParams={sp}
            value={search}
            placeholder={t("list.searchProducts")}
            label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")}
          />
        }
        filters={
          <>
            <InstantFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="branch"
              label={t("pages.colBranch")}
              value={branchId ? String(branchId) : ""}
              options={[
                { value: "", label: t("list.filterAll") },
                ...branches.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
            <InstantFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="brand"
              label={t("catalog.brand")}
              value={brand}
              options={[
                { value: "", label: t("list.filterAll") },
                ...PRODUCT_BRANDS.map((b) => ({ value: b, label: t(`brands.${b}`) })),
              ]}
            />
            <InstantFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="category"
              label={t("adminExtras.colCategory")}
              value={categoryId ? String(categoryId) : ""}
              options={[
                { value: "", label: t("list.filterAll") },
                ...categories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <InstantFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="status"
              label={t("pages.colStatus")}
              value={status}
              options={[
                { value: "", label: t("list.filterAll") },
                ...STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
              ]}
            />
            <InstantFilterSelect
              basePath={BASE}
              searchParams={sp}
              name="variationType"
              label={t("variationType.label")}
              value={variationType}
              options={[
                { value: "", label: t("list.filterAll") },
                ...PRODUCT_VARIATION_TYPES.map((v) => ({ value: v, label: t(`variationType.${v}`) })),
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
        {products.length === 0 ? (
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
            <EmptyState
              title={t("pages.noData")}
              action={<ButtonLink href="/admin/products/create">{t("catalog.addProduct")}</ButtonLink>}
            />
          )
        ) : (
          <>
            <ResponsiveDataView
              items={products}
              getKey={(p) => p.id}
              desktop={(rows) => (
                <Table
                  headers={[
                    t("adminExtras.colProduct"),
                    t("pages.colBranch"),
                    t("catalog.brand"),
                    t("adminExtras.colCategory"),
                    t("adminExtras.colPrice"),
                    t("pages.colStatus"),
                    t("pages.colActions"),
                  ]}
                >
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-hover/70">
                      <Td>
                        <span className="font-medium text-fg-base">{p.name}</span>
                        {p.variations.length > 1 ? (
                          <span className="ml-2 text-xs text-fg-muted">
                            {t("catalog.variationCount", { count: p.variations.length })}
                          </span>
                        ) : null}
                      </Td>
                      <Td>{p.branch.name}</Td>
                      <Td>{p.brand ? t(`brands.${p.brand}`) : "—"}</Td>
                      <Td>{p.category?.name ?? "—"}</Td>
                      <Td>{fmt.money(basePriceOf(p))}</Td>
                      <Td>{statusBadge(p)}</Td>
                      <Td className="text-right">{actionsFor(p)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(p) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg-base">{p.name}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        {p.branch.name}
                        {p.category ? ` · ${p.category.name}` : ""}
                      </p>
                    </div>
                    {actionsFor(p)}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-fg-base">{fmt.money(basePriceOf(p))}</span>
                    {statusBadge(p)}
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
