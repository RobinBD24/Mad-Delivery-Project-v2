import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ListFilterSelect, ListPagination, ListSearch } from "@/components/dashboard/list-controls";
import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import {
  enumParam,
  hasActiveFilters,
  listHref,
  pageMeta,
  parseListParams,
  type RawSearchParams,
} from "@/lib/http/list-params";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.deactivatedTitle") };
}

const BASE = "/admin/products/deactivated";
const SORTABLE = ["updatedAt", "name"] as const;
/** The three ways a product can be off the customer catalogue. */
const STATES = ["deactivated", "held", "deleted"] as const;

/**
 * /admin/products/deactivated — every product that is NOT on sale, and why.
 *
 * Soft-deleted products live here too: a super admin must still be able to find
 * one after deleting it, and this is the "deleted/deactivated filter" that makes
 * that possible. They are labelled Deleted rather than being folded in with
 * merely-deactivated products, and can be isolated with `?state=deleted`.
 *
 * Previously this page loaded every matching row at once with no controls.
 */
export default async function AdminDeactivatedProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { t, fmt } = await getT();
  await requireRole("super_admin");
  const sp = await searchParams;

  const { page, pageSize, skip, take, search, sort, direction } = parseListParams(sp, {
    sortable: SORTABLE,
    defaultSort: "updatedAt",
  });
  const state = enumParam(sp, "state", STATES);

  const and: Prisma.ProductWhereInput[] = [];
  if (state === "deleted") and.push({ deletedAt: { not: null } });
  if (state === "held") and.push({ heldByAdmin: true, deletedAt: null });
  if (state === "deactivated") and.push({ isAvailable: false, heldByAdmin: false, deletedAt: null });
  if (!state) {
    and.push({ OR: [{ isAvailable: false }, { heldByAdmin: true }, { deletedAt: { not: null } }] });
  }
  if (search) {
    and.push({
      OR: [
        { name: { contains: search } },
        { branch: { name: { contains: search } } },
        { category: { name: { contains: search } } },
      ],
    });
  }
  const where: Prisma.ProductWhereInput = { AND: and };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { branch: true, category: true },
      orderBy: sort === "name" ? { name: direction } : { updatedAt: direction },
      skip,
      take,
    }),
  ]);
  const meta = pageMeta(total, page, pageSize);
  const filtered = hasActiveFilters(sp, ["search", "state"]);

  const stateLabel = (value: string) =>
    value === "held"
      ? t("adminExtras.heldBadge")
      : value === "deleted"
        ? t("catalog.deletedBadge")
        : t("adminExtras.deactivatedBadge");

  const badge = (p: (typeof products)[number]) =>
    p.deletedAt ? (
      <Badge tone="slate">{t("catalog.deletedBadge")}</Badge>
    ) : p.heldByAdmin ? (
      <Badge tone="red">{t("adminExtras.heldBadge")}</Badge>
    ) : (
      <Badge tone="amber">{t("adminExtras.deactivatedBadge")}</Badge>
    );

  const reason = (p: (typeof products)[number]) =>
    p.deletedAt
      ? t("catalog.deletedBadge")
      : p.heldByAdmin
        ? t("adminExtras.heldByAdminReason")
        : p.deactivationReason || "—";

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        title={t("adminExtras.deactivatedTitle")}
        subtitle={t("adminExtras.deactivatedSub")}
        actions={
          <ButtonLink href="/admin/products" variant="outline">
            {t("adminExtras.allProducts")}
          </ButtonLink>
        }
      />

      <FilterBar
        search={
          <ListSearch
            basePath={BASE}
            searchParams={sp}
            value={search}
            placeholder={t("list.searchProducts")}
            label={t("list.searchLabel")}
            clearLabel={t("list.clearSearch")}
            submitLabel={t("list.searchSubmit")}
          />
        }
        filters={
          <ListFilterSelect
            basePath={BASE}
            searchParams={sp}
            name="state"
            label={t("pages.colStatus")}
            value={state}
            applyLabel={t("list.apply")}
            options={[
              { value: "", label: t("list.filterAll") },
              ...STATES.map((s) => ({ value: s, label: stateLabel(s) })),
            ]}
          />
        }
        activeFilters={[
          ...(search
            ? [{ key: "search", label: t("list.searchLabel"), value: search, removeHref: listHref(BASE, sp, { search: undefined }) }]
            : []),
          ...(state
            ? [{ key: "state", label: t("pages.colStatus"), value: stateLabel(state), removeHref: listHref(BASE, sp, { state: undefined }) }]
            : []),
        ]}
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
              title={t("adminExtras.noneDeactivated")}
              description={t("adminExtras.noneDeactivatedDesc")}
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
                    t("pages.colStatus"),
                    t("adminExtras.colReason"),
                    t("pages.colDate"),
                  ]}
                >
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-hover/70">
                      <Td>
                        <span className="font-medium text-fg-base">{p.name}</span>
                      </Td>
                      <Td>{p.branch.name}</Td>
                      <Td>{badge(p)}</Td>
                      <Td>
                        <span className="text-sm text-fg-muted">{reason(p)}</span>
                      </Td>
                      <Td>
                        <span className="text-xs text-fg-muted">
                          {fmt.dateTime(p.updatedAt.toISOString())}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
              mobile={(p) => (
                <div className="rounded-xl border border-border-base bg-surface-card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg-base">{p.name}</p>
                      <p className="truncate text-xs text-fg-subtle">{p.branch.name}</p>
                    </div>
                    {badge(p)}
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{reason(p)}</p>
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
