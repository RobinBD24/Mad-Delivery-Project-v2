# INTERNAL LIST PAGINATION AUDIT — MAD Delivery HQ

Server-side pagination, search and filtering across authenticated list pages.
Shared infrastructure: `lib/http/list-params.ts` (`parseListParams`, `pageMeta`,
`listHref`, `enumParam`, `dateParam`, `hasActiveFilters`) and
`components/dashboard/list-controls.tsx` (`ListSearch`, `ListFilterSelect`,
`ListPagination`).

## Shared page size

`DEFAULT_PAGE_SIZE = 10` (was 20). One shared default for every server-paginated
list; a page needing a different size passes `defaultPageSize` explicitly rather
than redefining the constant. `MAX_PAGE_SIZE = 100` still caps a hand-edited
`?pageSize=`.

## Product pages (this round)

| Page | Rows/page | Search | Filters | Sort | Mobile cards |
| --- | --- | --- | --- | --- | --- |
| `/admin/products` | 10, server-side | name, description, brand, branch name, category name | branch, brand, category, status (available/deactivated/held), variation type | name, price, createdAt, updatedAt (whitelisted) | yes |
| `/admin/products/deactivated` | 10, server-side | name, branch name, category name | state (deactivated / held / deleted) | updatedAt, name | yes |

Both replaced unbounded queries — `/admin/products` used `take: 300` with no
controls at all, and the deactivated list loaded every matching row. Summary
cards on `/admin/products` count the full authorized dataset via
`getAdminProductSummary()`, not the visible page, and each links to the filter
that isolates it. Sorting is whitelist-only, so a crafted query string can never
reach Prisma's `orderBy`.

Soft-deleted products remain reachable to a Super Admin through
`/admin/products/deactivated?state=deleted`, labelled **Deleted**.

## Verified

`tests/e2e/54-product-system-sync.spec.ts` asserts: at most 10 rows on page 1, a
server-rendered page 2 that differs from page 1, search returning exactly one
row, and six filter combinations each producing either matching rows (≤10) or the
explicit no-results state. `tests/e2e/full-page-audit/admin.spec.ts` asserts the
reported total and per-product reachability through search.

## Remaining

- `/branch-manager/catalog` still requests `page_size=100` over the self-fetch
  path and is not server-paginated.
- The list routes named in `INTERNAL_PAGE_ENHANCEMENT_AUDIT.md` (Management
  Branches/Orders, Marketing Products/Campaigns/Coupons, BM Riders/Reservations/
  Employees/Attendance, accounts ledgers, rider earnings/withdrawals) are
  unchanged by this round.
