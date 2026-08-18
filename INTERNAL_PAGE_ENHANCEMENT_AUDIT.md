# Internal Page Enhancement Audit

Project: `/home/labour_care/mad-delivery-hq`
Authenticated routes inventoried: **154**
Dashboard home routes excluded from redesign: **7**

Status counts: **EXISTING_PAGE_REFINED** 100 · **ENHANCED** 46 · **DASHBOARD_EXCLUDED** 7 · **DEDICATED_PAGE_CREATED** 1

Every row is derived by INSPECTING the route's own source **plus the source of
each local component it imports** — not from a previous report. A route counts
as having summary cards / responsive cards / a delete modal only when that
primitive genuinely appears in the code it renders.

| Route | Role | Type | Dashboard excluded | Summary cards | Responsive cards | Confirm modal | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| `/accounts/adjustments` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/audit-log` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/complaints` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/dashboard` | Accounts | Dashboard home | YES | yes | — | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/accounts/expenses` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/invoices/[id]` | Accounts | Detail | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/invoices` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/notifications` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/orders` | Accounts | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/accounts/payments` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/ramadan` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/refunds` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/reports` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/rider-earnings` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/sales` | Accounts | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/accounts/settlements` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/transactions` | Accounts | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/accounts/withdrawals` | Accounts | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/activity-logs` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/admin/branch-manager-history` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/admin/branches/[id]/edit` | Super Admin | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/branches/[id]` | Super Admin | Detail | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/branches/create` | Super Admin | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/branches` | Super Admin | List/management | no | yes | — | yes | ENHANCED | Shared header + real aggregate summary cards + confirm modal |
| `/admin/categories/new` | Super Admin | Create form | no | yes | — | — | DEDICATED_PAGE_CREATED | New route; inline create form removed from the list page |
| `/admin/categories` | Super Admin | List/management | no | yes | — | yes | ENHANCED | Shared header + real aggregate summary cards + confirm modal |
| `/admin/complaints` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/customers/blocked` | Super Admin | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/customers` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/admin/dashboard` | Super Admin | Dashboard home | YES | yes | yes | yes | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/admin/delivery-areas/[id]/edit` | Super Admin | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/delivery-areas/new` | Super Admin | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/delivery-areas` | Super Admin | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/notices` | Super Admin | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/notifications` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/orders/[id]` | Super Admin | Detail | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/orders` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/admin/products/[id]/edit` | Super Admin | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/products/create` | Super Admin | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/products/deactivated` | Super Admin | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/products` | Super Admin | List/management | no | yes | — | yes | ENHANCED | Shared header + real aggregate summary cards + confirm modal |
| `/admin/reports/attendance` | Super Admin | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/reports/cancelled-orders` | Super Admin | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/reports/orders` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/reports` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/reports/sales` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/rewards` | Super Admin | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/settings/delivery-fees` | Super Admin | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/admin/settings` | Super Admin | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/staff` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/admin/users/[id]/edit` | Super Admin | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/users/[id]` | Super Admin | Detail | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/admin/users/create` | Super Admin | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/admin/users` | Super Admin | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/branch-manager/attendance` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/catalog/categories/[id]/edit` | Branch Manager | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Renders shared view/panel components; no page-level header primitive |
| `/branch-manager/catalog/categories/create` | Branch Manager | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Renders shared view/panel components; no page-level header primitive |
| `/branch-manager/catalog` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/catalog/products/[id]/edit` | Branch Manager | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/catalog/products/create` | Branch Manager | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/complaints` | Branch Manager | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/branch-manager/dashboard` | Branch Manager | Dashboard home | YES | yes | yes | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/branch-manager/delivery-areas/[id]/edit` | Branch Manager | Edit form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/delivery-areas/new` | Branch Manager | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/delivery-areas` | Branch Manager | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/branch-manager/delivery-hours` | Branch Manager | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/branch-manager/delivery-zone` | Branch Manager | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/branch-manager/duty-history` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/employees` | Branch Manager | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/branch-manager/notifications` | Branch Manager | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/branch-manager/orders/[id]` | Branch Manager | Detail | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/branch-manager/orders` | Branch Manager | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/branch-manager/ramadan-bookings` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/reports` | Branch Manager | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/branch-manager/riders` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/table-reservations/[id]` | Branch Manager | Detail | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/table-reservations` | Branch Manager | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/branch-manager/tables` | Branch Manager | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/change-password` | Shared | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/complaints/[id]` | Shared | Detail | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/complaints/new` | Shared | Create form | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/addresses` | Customer | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/customer/branches/[id]/menu` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/branches` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/cart` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/checkout` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/complaints` | Customer | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/customer/dashboard` | Customer | Dashboard home | YES | yes | yes | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/customer/notifications` | Customer | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/customer/orders/[id]` | Customer | Detail | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/customer/orders` | Customer | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/customer/ramadan-bookings` | Customer | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/customer/reservations/[id]` | Customer | Detail | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/reservations` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/reviews` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/customer/rewards` | Customer | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/customer/settings` | Customer | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/customer/support` | Customer | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/analytics` | Management | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/management/branches` | Management | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/complaints` | Management | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/management/dashboard` | Management | Dashboard home | YES | yes | — | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/management/exports` | Management | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/notifications` | Management | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/management/orders` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/performance` | Management | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/ramadan` | Management | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/reports/attendance` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/branches` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/complaints` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/customers` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/delivery` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/finance` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/marketing` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/orders` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports` | Management | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/management/reports/products` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/riders` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/management/reports/sales` | Management | List/management | no | — | yes | — | EXISTING_PAGE_REFINED | Shared page header + responsive mobile cards |
| `/marketing/audience` | Marketing | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/campaigns/[id]/edit` | Marketing | Edit form | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/campaigns/create` | Marketing | Create form | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/campaigns` | Marketing | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/complaints` | Marketing | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/marketing/coupons/[id]/edit` | Marketing | Edit form | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/coupons/create` | Marketing | Create form | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/coupons` | Marketing | List/management | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/marketing/customers` | Marketing | List/management | no | yes | yes | — | ENHANCED | Shared header + real aggregate summary cards + responsive mobile cards |
| `/marketing/dashboard` | Marketing | Dashboard home | YES | yes | yes | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/marketing/feedback` | Marketing | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/marketing/notifications` | Marketing | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/marketing/performance` | Marketing | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/marketing/products` | Marketing | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/marketing/reports` | Marketing | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/profile` | Shared | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/attendance` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/complaints` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/dashboard` | Rider | Dashboard home | YES | — | — | — | DASHBOARD_EXCLUDED | Excluded by scope — untouched |
| `/rider/deliveries` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/duty-history` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/earnings` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/location-history` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/login-history` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/new-orders` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/notifications` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/order-history` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/orders/[id]` | Rider | Detail | no | — | — | yes | EXISTING_PAGE_REFINED | Shared page header + confirm modal |
| `/rider/orders` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/performance` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/route-history` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/support` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/vehicle` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |
| `/rider/wallet` | Rider | List/management | no | yes | — | — | ENHANCED | Shared header + real aggregate summary cards |
| `/rider/withdrawals` | Rider | List/management | no | — | — | — | EXISTING_PAGE_REFINED | Shared page header |

---

## Follow-up pass — server-side list controls

### Shared infrastructure added

| File | Purpose |
|---|---|
| `lib/http/list-params.ts` | Parses and **clamps** `page`/`pageSize`/`search`/`sort`/`direction` and typed filter params. `sort` resolves against an explicit whitelist, so a crafted query string can never reach Prisma's `orderBy`. `pageMeta()` reports a page beyond the end as the last real page, so deleting the last row never leaves an empty invalid page. `listHref()` rebuilds a URL preserving other params and resets `page` when a filter changes. |
| `components/dashboard/list-controls.tsx` | `ListSearch`, `ListFilterSelect`, `ListPagination` — all server-rendered GET forms/links, so no hydration cost and Back/Forward work. Pagination renders "Showing X–Y of Z" plus Previous/Next/page numbers, each carrying the current search, filters and sort. |

### The five screenshot pages — fixed

| Route | Before | After |
|---|---|---|
| `/admin/customers` | `take: 200`, no cards/search/filters/pagination | 5 real aggregates (total/active/blocked/with-orders/new-this-month), phone-normalised search, status filter, sortable, **server-side paging**, mobile cards |
| `/admin/staff` | unbounded `findMany`, nothing else | 5 aggregates scoped to the SAME `STAFF_ROLES` list the directory queries, search, role + status filters, paging, mobile cards |
| `/admin/orders` | fetched 100 orders and rendered all | queries Prisma via `ordersWhereForUser()` (identical RBAC), 7 status aggregates each linking to its filter, search by order number/customer/phone, status + branch + method filters, date range, paging |
| `/admin/branch-manager-history` | paging only | 5 aggregates, manager/branch search, active-vs-completed filter, date range, mobile cards |
| `/admin/activity-logs` | paging only | total/today plus the three **recorded** activity types (no invented "security-sensitive" bucket), search across manager/branch/description, type filter, date range |

### Evidence

`tests/e2e/50-list-pagination-search.spec.ts` asserts real values, not element presence:
row counts never exceed the page size; the total card equals the authoritative API
count; the "Showing X–Y" range equals the rows actually rendered; clicking the
blocked card filters the URL **and every rendered row is blocked**; Back restores
the unfiltered list; `?role=rider` yields only riders. 5/5 pass, plus 60/60 on the
existing dashboard suites.

### Still outstanding

Only the five named routes plus the shared infrastructure were converted in this
pass. The other list pages identified as loading unbounded data still do so and
are listed below for the next pass:

- API `page_size=100/200`: `/marketing/products`, `/customer/reservations`,
  `/accounts/orders`, `/accounts/audit-log`, `/accounts/adjustments`,
  `/accounts/settlements`, `/accounts/expenses`, `/accounts/refunds`,
  `/rider/earnings`, `/rider/withdrawals`, `/management/orders`,
  `/management/branches`, `/admin/branches`, `/branch-manager/catalog`,
  `/branch-manager/table-reservations`.
- Unbounded `findMany`: `/admin/delivery-areas`, `/admin/customers/blocked`,
  `/admin/products/deactivated`, `/customer/ramadan-bookings`,
  `/rider/route-history`, `/rider/attendance`, `/branch-manager/delivery-zone`.

The shared helpers above are the pattern for each — `parseListParams` +
`pageMeta` + `ListSearch`/`ListFilterSelect`/`ListPagination`.
