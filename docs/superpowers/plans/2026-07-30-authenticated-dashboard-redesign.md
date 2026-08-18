# Authenticated Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize all 153 authenticated MAD Delivery HQ pages with one responsive, accessible, role-safe design system while preserving every route, feature, API, permission, validation rule, and workflow.

**Architecture:** Extend existing server-first Next.js App Router architecture with shared authenticated layout primitives, semantic design tokens, server-rendered summary components, URL-driven filters, and responsive desktop-table/mobile-card views. Roll out shared primitives first, then each role family, retaining existing client boundaries only for real interaction and live Rider workflows.

**Tech Stack:** Next.js 16.2.10 App Router, React Server Components, TypeScript, Tailwind CSS v4 tokens, Prisma, next-intl-style project i18n helpers, Playwright.

## Global Constraints

- Work only in `/Users/whiteking/Desktop/Desktop/WebDevelopment/mad-delivery-hq`.
- Preserve all existing uncommitted Delivery Areas changes.
- Do not modify public-facing pages or public visual baselines.
- Do not change routes, API contracts, schema, business rules, RBAC, branch ownership, validation, order/payment/GPS/notification/reward/reservation logic.
- No Git commit, push, pull, reset, clean, checkout, restore, stash, or rebase.
- No database reset, force reset, destructive SQL, production seed, deployment, PM2, Nginx, SSL, DNS, cron, systemd, firewall, or Docker action.
- New labels require exact `messages/en.json` and `messages/bn.json` parity.
- Test at 320, 360, 375, 390, 414, 768, 1024, and desktop widths.
- Use real authorized aggregate data only; no fake trends, estimates, or current-page totals.

---

## File Structure

### New shared files

- `components/dashboard/dashboard-page.tsx`: page frame, breadcrumbs, header, and sections.
- `components/dashboard/summary-card.tsx`: server-first summary card, grid, skeleton, and error presentation.
- `components/dashboard/filter-bar.tsx`: URL-compatible search/filter shell and active filters.
- `components/dashboard/responsive-data-view.tsx`: desktop table/mobile card switch.
- `components/dashboard/table-actions-menu.tsx`: accessible compact action menu.
- `components/dashboard/dashboard-states.tsx`: page, inline, list, and skeleton states.
- `lib/dashboard/page-summary.ts`: server-only aggregate result contracts and safe loader.
- `DASHBOARD_UI_REDESIGN_AUDIT.md`: route-by-route record for all 153 authenticated pages.
- `tests/e2e/45-dashboard-design-system.spec.ts`: shell/components/themes/locales/responsive coverage.
- `tests/e2e/46-dashboard-role-pages.spec.ts`: role scope and representative page coverage.
- `tests/e2e/47-rider-mobile-redesign.spec.ts`: Rider workflow/mobile coverage.

### Shared files to modify

- `app/globals.css`: authenticated semantic tokens and reduced-motion rules.
- `app/(dashboard)/layout.tsx`: unchanged auth/data behavior; shell props only if required.
- `app/(dashboard)/loading.tsx`: content-shaped dashboard skeleton.
- `app/(dashboard)/error.tsx`: refined safe full-page error state.
- `components/layout/dashboard-shell.tsx`: responsive content frame.
- `components/layout/sidebar.tsx`: refined desktop/mobile navigation.
- `components/layout/topbar.tsx`: compact responsive topbar.
- `components/dashboard/dashboard-status-bar.tsx`: dispatch-rail visual refinement.
- `components/layout/page-header.tsx`: compatibility wrapper over shared page header.
- `components/ui/card.tsx`, `components/ui/table.tsx`, `components/ui/badge.tsx`, `components/ui/button.tsx`, `components/ui/empty-state.tsx`, `components/ui/confirm-modal.tsx`, `components/ui/input.tsx`, `components/ui/pagination.tsx`: shared visual/accessibility refinements.
- `components/ui/stat-card.tsx`, `components/ui/stat-chip.tsx`: compatibility path to summary system.
- `messages/en.json`, `messages/bn.json`: shared dashboard labels.
- `NEW_FEATURES_IMPLEMENTATION_AUDIT.md`: concise design-only completion record.

### Role pages

Every `page.tsx` under these authenticated directories is included:

- `app/(dashboard)/admin/**`
- `app/(dashboard)/branch-manager/**`
- `app/(dashboard)/rider/**`
- `app/(dashboard)/customer/**`
- `app/(dashboard)/management/**`
- `app/(dashboard)/marketing/**`
- `app/(dashboard)/accounts/**`
- Shared authenticated `profile`, `change-password`, `complaints/new`, and `complaints/[id]`

Only pages needing markup refinement are modified. Audit records unchanged pages as `EXISTING_DESIGN_REFINED` or `NOT_NEEDED` with reason.

---

### Task 1: Route Inventory and Regression Contract

**Files:**
- Create: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Create: `tests/e2e/45-dashboard-design-system.spec.ts`
- Modify: none of production code

**Interfaces:**
- Consumes: route files under `app/(dashboard)`.
- Produces: exact 153-route audit and test IDs required by later tasks.

- [x] **Step 1: Generate authenticated route list**

Run:

```bash
rg --files 'app/(dashboard)' | rg '/page\.tsx$' | sort
```

Expected: 153 route files.

- [x] **Step 2: Write audit rows**

Use columns:

```markdown
| Route | Role | Type | Current layout | Summary | Search/filters | Desktop/mobile | Actions | Empty/loading/error | Status |
```

Every row starts `NOT_NEEDED` only when reason is explicit; otherwise `REDESIGNED` or `EXISTING_DESIGN_REFINED` remains pending until verified.

- [x] **Step 3: Write shell regression test**

Test must assert:

```ts
await expect(page.getByTestId("dashboard-sidebar")).toBeVisible();
await expect(page.getByTestId("dashboard-topbar")).toBeVisible();
await expect(page.getByTestId("dashboard-status-bar")).toBeVisible();
await expect(page.locator("main")).toHaveCSS("overflow-x", "visible");
```

Add mobile assertion that sidebar starts off-canvas, opens from `sidebar-toggle`, closes with Escape, and page body width equals viewport width.

- [x] **Step 4: Run test to establish baseline**

Run:

```bash
E2E_PORT=3101 npx playwright test tests/e2e/45-dashboard-design-system.spec.ts --workers=1 --retries=0
```

Expected: new visual-contract assertions fail before shared redesign.

---

### Task 2: Authenticated Tokens and Shell

**Files:**
- Modify: `app/globals.css`
- Modify: `components/layout/dashboard-shell.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/topbar.tsx`
- Modify: `components/dashboard/dashboard-status-bar.tsx`
- Modify: `components/layout/dashboard-brand.tsx`
- Test: `tests/e2e/45-dashboard-design-system.spec.ts`

**Interfaces:**
- Produces: semantic classes/tokens used by every later component; existing shell props remain source-compatible.

- [x] **Step 1: Read Next.js 16 layout/client-boundary docs**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

- [x] **Step 2: Add shell token contract**

Add theme-backed tokens for page max width, section gap, control heights, radii, elevation, semantic status surfaces, and Rider action size. Keep current brand and neutral values as roots.

- [x] **Step 3: Refine shell**

Keep `DashboardShell` API unchanged. Add:

```tsx
<main
  id="dashboard-content"
  className="dashboard-content min-w-0 flex-1"
>
  <div className="dashboard-content-inner">{children}</div>
</main>
```

Ensure wide operational content can opt into full width without body overflow.

- [x] **Step 4: Refine sidebar and topbar**

Preserve `ROLE_NAV`, intent prefetch, notification, theme, locale, profile, and logout behavior. Add visible skip-to-content link, stronger active rail, safe Bangla wrapping, 44px mobile targets, and non-wrapping mobile topbar.

- [x] **Step 5: Refine dispatch rail**

Keep existing Asia/Dhaka clock and live indicator. Remove no behavior. Make rail compact on mobile and hide only decorative separator.

- [x] **Step 6: Run shell tests**

Run focused test at 320, 768, and desktop projects/viewports. Expected: no body overflow; drawer and controls remain usable.

---

### Task 3: Page, State, and Feedback Primitives

**Files:**
- Create: `components/dashboard/dashboard-page.tsx`
- Create: `components/dashboard/dashboard-states.tsx`
- Modify: `components/layout/page-header.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/empty-state.tsx`
- Modify: `components/ui/confirm-modal.tsx`
- Modify: `app/(dashboard)/loading.tsx`
- Modify: `app/(dashboard)/error.tsx`
- Test: `tests/e2e/45-dashboard-design-system.spec.ts`

**Interfaces:**
- Produces:

```ts
type DashboardPageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
};

function DashboardPage(props: { children: ReactNode; width?: "default" | "wide" }): JSX.Element;
function DashboardSection(props: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode }): JSX.Element;
```

- [x] **Step 1: Add component tests via representative server page**

Assert one h1, breadcrumb semantics, action stacking at 320px, and focus-visible styles.

- [x] **Step 2: Build server-first page primitives**

No `"use client"` in page primitives. Existing `PageHeader` delegates to `DashboardPageHeader` so unchanged pages inherit new hierarchy.

- [x] **Step 3: Build shaped states**

Create `DashboardPageSkeleton`, `SummaryGridSkeleton`, `TableRowsSkeleton`, `InlineErrorState`, and empty-state variants. No user-facing hardcoded English.

- [x] **Step 4: Refine confirmation dialog**

Preserve action callbacks. Add dialog labelling, focus trap/restore, Escape, pending lock, safe mobile height, and inline error slot.

- [x] **Step 5: Run focused tests**

Expected: header, skeleton, error, empty, and dialog checks pass in both themes.

---

### Task 4: Summary Card System and Reports Proof

**Files:**
- Create: `components/dashboard/summary-card.tsx`
- Create: `lib/dashboard/page-summary.ts`
- Modify: `components/ui/stat-card.tsx`
- Modify: `components/ui/stat-chip.tsx`
- Modify: `app/(dashboard)/admin/reports/page.tsx`
- Modify: `app/(dashboard)/accounts/reports/page.tsx`
- Modify: `app/(dashboard)/branch-manager/reports/page.tsx`
- Modify: `app/(dashboard)/marketing/reports/page.tsx`
- Modify: relevant report pages under `management/reports`
- Modify: `messages/en.json`
- Modify: `messages/bn.json`
- Test: `tests/e2e/45-dashboard-design-system.spec.ts`

**Interfaces:**
- Produces:

```ts
type SummaryAccent = "brand" | "success" | "warning" | "danger" | "info" | "violet" | "neutral";
type SummaryCardProps = {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  accent?: SummaryAccent;
  href?: string;
  testId?: string;
};

function SummaryCardGrid(props: { children: ReactNode; className?: string }): JSX.Element;
type SummaryResult<T> = { ok: true; data: T } | { ok: false; reference?: string };
```

- [x] **Step 1: Write failing summary tests**

Cover large value wrapping, long Bangla title, semantic link behavior, keyboard focus, skeleton dimensions, light/dark contrast class, and one-column mobile/two-four-column expansion.

- [x] **Step 2: Implement server-first cards**

Decorative icon wrapper uses `aria-hidden`. Static cards have no hover cursor. Linked cards use `Link`, focus ring, minimum target size, and no mutation.

- [x] **Step 3: Add safe summary loader**

`loadPageSummary(loader)` catches only summary failure, returns error union, and does not substitute zeros.

- [x] **Step 4: Refactor Reports pages**

Keep current metrics/data sources. Replace duplicated grids/`StatCard` markup with `SummaryCardGrid` and `SummaryCard`. Branch Manager Reports gains only real existing dashboard metrics.

- [x] **Step 5: Verify translation parity and reports**

Run JSON key parity plus existing Reports Playwright tests. Expected: same values, no visual regression in information content.

---

### Task 5: Filters, Responsive Data, Actions, and Pagination

**Files:**
- Create: `components/dashboard/filter-bar.tsx`
- Create: `components/dashboard/responsive-data-view.tsx`
- Create: `components/dashboard/table-actions-menu.tsx`
- Modify: `components/ui/table.tsx`
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/pagination.tsx`
- Modify: `components/ui/badge.tsx`
- Test: `tests/e2e/45-dashboard-design-system.spec.ts`

**Interfaces:**
- Produces:

```ts
type ActiveFilter = { key: string; label: string; value: string; removeHref: string };
function FilterBar(props: { search?: ReactNode; filters?: ReactNode; activeFilters?: ActiveFilter[]; clearHref?: string; resultsLabel?: string }): JSX.Element;
function ResponsiveDataView<T>(props: { items: T[]; desktop: (items: T[]) => ReactNode; mobile: (item: T) => ReactNode; getKey: (item: T) => Key }): JSX.Element;
type TableAction = { label: string; href?: string; onSelect?: () => void; tone?: "default" | "danger"; disabled?: boolean };
```

- [x] **Step 1: Write mobile/list behavior tests**

Assert desktop table hidden below breakpoint, mobile cards visible, action menu keyboard behavior, filter URLs, clear behavior, and pagination target preservation.

- [x] **Step 2: Implement filter bar**

Server-compatible wrapper; client code only for drawer/menu toggles. Search forms use GET and existing query names.

- [x] **Step 3: Implement responsive view and action menu**

Do not duplicate data fetching. Mobile and desktop render from one server result. Preserve every existing action.

- [x] **Step 4: Refine shared table/status/pagination**

Improve cell density, sticky header opt-in, wrapping, hover, focus, and touch targets. Keep current exports source-compatible.

- [x] **Step 5: Run focused component tests**

Expected: responsive switching and all actions/URLs pass.

---

### Task 6: Super Admin and Branch Manager Rollout

**Files:**
- Review every page under `app/(dashboard)/admin/**`; modify every route classified `REDESIGNED` or `EXISTING_DESIGN_REFINED` in `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Review every page under `app/(dashboard)/branch-manager/**`; modify every route classified `REDESIGNED` or `EXISTING_DESIGN_REFINED` in `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Modify: domain services/selectors only where aggregate summaries or server filters are missing
- Modify: `messages/en.json`, `messages/bn.json`
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Test: existing admin and branch-manager full-page tests
- Test: `tests/e2e/46-dashboard-role-pages.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–5 shared primitives.
- Produces: system-wide authorized summaries and manager-own-branch summaries.

- [x] **Step 1: Add failing role-scope tests**

Seed/use two branches. Assert Branch Manager cards, lists, and URL branch tampering never show foreign branch values.

- [x] **Step 2: Redesign dashboards and Reports**

Remove duplicate metric strips when redundant. Preserve charts, quick actions, order actions, and branch identity.

- [x] **Step 3: Redesign list/management pages**

Apply summary/filter/responsive-list pattern to branches, users/customers/staff, products/categories, delivery areas, orders, complaints, riders/employees, attendance, reservations/tables, Ramadan, payments/rewards/notices/notifications, logs/history, and settings lists where meaningful.

- [x] **Step 4: Refine detail/create/edit pages**

Add breadcrumb/header/section structure only. Preserve current forms/actions and Delivery Areas dirty work.

- [x] **Step 5: Update audit rows**

Every Admin and Branch Manager route receives final status and reason.

- [ ] **Step 6: Run existing and new role tests**

Expected: values, scope, actions, filters, EN/BN, and mobile layouts pass.

---

### Task 7: Rider Mobile-first Rollout

**Files:**
- Modify: `app/(dashboard)/rider/**`
- Modify: `components/rider/**` only for presentation/layout
- Modify: `components/riders/**` only for presentation/layout
- Modify: `messages/en.json`, `messages/bn.json`
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Create: `tests/e2e/47-rider-mobile-redesign.spec.ts`

**Interfaces:**
- Preserves: `RiderAssignmentGate`, `RiderLocationTracker`, duty controls, chats, confirmation, status transition, and existing API calls.

- [x] **Step 1: Write Rider workflow tests**

Cover offline, online, GPS denied, pending assignment gate, active delivery, pickup/progression action, chat access, and 320px touch-target layout.

- [x] **Step 2: Reorder dashboard visual hierarchy**

Place duty/GPS/assignment/active-delivery above secondary earnings/history. Keep assignment gate blocking behavior unchanged.

- [x] **Step 3: Refine Rider internal pages**

Use card-based mobile history/orders/earnings/wallet/withdrawals/attendance/location/route/login/duty/performance/vehicle/support/notifications/complaints views. Never show other Rider data.

- [x] **Step 4: Replace estimated earnings display**

Remove `delivered * BASE_EARNING`; display actual authorized commission aggregate already used by wallet/earnings service. No business calculation change.

- [x] **Step 5: Run Rider tests**

Expected: existing Rider workflow tests and new mobile tests pass without API/logic changes.

---

### Task 8: Customer Authenticated Rollout

**Files:**
- Modify: `app/(dashboard)/customer/**`
- Modify: Customer-specific components only for presentation
- Modify: `messages/en.json`, `messages/bn.json`
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Test: `tests/e2e/46-dashboard-role-pages.spec.ts`

- [ ] **Step 1: Add own-data tests**

Assert customer cards/lists contain only signed-in customer orders, addresses, rewards, reservations, payments, and notifications.

- [x] **Step 2: Refine dashboard**

Prioritize Order Now, active order, recent orders, addresses, rewards, and reservations. Keep public homepage/menu unchanged.

- [x] **Step 3: Refine customer pages**

Use friendly lower-density cards and responsive lists for orders, addresses, complaints, notifications, reservations, reviews, rewards, support, and branches. Cart/checkout retain workflow and receive only authenticated shell/form visual consistency.

- [ ] **Step 4: Run customer and public-guard tests**

Expected: customer scope passes; `git diff -- app/page.tsx components/home lib/home` remains empty relative to initial task state.

---

### Task 9: Management, Marketing, and Accounts Rollout

**Files:**
- Review every page under `app/(dashboard)/management/**`; modify every route classified `REDESIGNED` or `EXISTING_DESIGN_REFINED` in `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Review every page under `app/(dashboard)/marketing/**`; modify every route classified `REDESIGNED` or `EXISTING_DESIGN_REFINED` in `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Review every page under `app/(dashboard)/accounts/**`; modify every route classified `REDESIGNED` or `EXISTING_DESIGN_REFINED` in `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Modify domain presentation components imported by those pages and aggregate selectors required by their recorded summary rows
- Modify: `messages/en.json`, `messages/bn.json`
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Test: `tests/e2e/46-dashboard-role-pages.spec.ts`

- [ ] **Step 1: Add permission and financial tests**

Assert Management has read-only actions, Marketing sees only relevant content metrics, Accounts totals match seeded Decimal values, and no role gains links/actions.

- [x] **Step 2: Refine Management**

Apply executive summary, report navigation, responsive branches/orders/complaints/Ramadan/performance/exports/report views.

- [x] **Step 3: Refine Marketing**

Apply campaigns/coupons/audience/customers/feedback/products/performance/reports/complaints/notifications patterns. Use stored metrics only.

- [x] **Step 4: Refine Accounts**

Apply financial summaries, filters, responsive tables, and status hierarchy to payments/refunds/settlements/transactions/withdrawals/expenses/adjustments/invoices/orders/reports/earnings/sales/audit/complaints/Ramadan/notifications.

- [ ] **Step 5: Run role tests**

Expected: role actions, Decimal formatting, filters, mobile views, and reports pass.

---

### Task 10: Shared Detail/Form/Dialog Completion

**Files:**
- Modify: shared authenticated pages `app/(dashboard)/profile/page.tsx`, `change-password/page.tsx`, `complaints/new/page.tsx`, `complaints/[id]/page.tsx`
- Modify: remaining authenticated detail/create/edit pages identified in audit
- Modify: shared form components only for styling/layout
- Test: existing full-page audit suites

- [x] **Step 1: Audit all nested routes**

Confirm every `[id]`, `create`, `new`, and `edit` page has breadcrumb, one h1, structured sections, mobile actions, existing validation, and safe destructive separation.

- [x] **Step 2: Refine shared forms/details**

No field/action/validation removal. Preserve submitted values and pending/error behavior.

- [x] **Step 3: Refine dialogs/drawers**

Verify focus, Escape, selected entity identity, pending state, internal scrolling, and no stale overlay.

- [ ] **Step 4: Run existing workflow tests**

Expected: CRUD and state-transition tests pass unchanged.

---

### Task 11: Translation, Theme, Responsive, and Performance Verification

**Files:**
- Modify: `messages/en.json`, `messages/bn.json` only for parity corrections
- Modify: affected shared/page files only for verified defects
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`

- [x] **Step 1: Check translation parity**

Run recursive key comparison. Expected: identical key sets and no untranslated shared labels.

- [x] **Step 2: Run changed-file lint**

Run ESLint only on changed TypeScript/TSX files first. Fix all introduced errors.

- [x] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0 without route/type errors.

- [ ] **Step 4: Run focused Playwright matrix**

Run representative dashboard, list, detail, form, modal, Rider, and Customer pages at all required widths in light/dark and EN/BN.

- [x] **Step 5: Inspect screenshots**

Reject body overflow, crushed tables, clipped dialogs, hidden actions, Bangla overflow, low contrast, layout shift, or Rider controls below irrelevant content.

- [x] **Step 6: Check performance safeguards**

Inspect request counts and hydration boundaries on representative pages. Confirm no per-card requests, full-page polling, heavy library, or public bundle change.

---

### Task 12: Final Audit and Evidence

**Files:**
- Modify: `DASHBOARD_UI_REDESIGN_AUDIT.md`
- Modify: `NEW_FEATURES_IMPLEMENTATION_AUDIT.md`

- [x] **Step 1: Recount audit**

Expected: exactly 153 route rows, each `REDESIGNED`, `EXISTING_DESIGN_REFINED`, or `NOT_NEEDED` with reason.

- [x] **Step 2: Record concise feature audit**

Document design-only scope, shared system, role waves, Rider priority, checks, and explicit safety confirmations.

- [x] **Step 3: Capture final Git status**

Run:

```bash
git status --short
git diff --stat
```

Separate pre-existing Delivery Areas changes from redesign files. Do not stage or commit.

- [x] **Step 4: Deliver 49-point evidence report**

Use exact completion label only when all acceptance criteria hold:

```text
DASHBOARD REDESIGN COMPLETE
```

Otherwise use:

```text
DASHBOARD REDESIGN INCOMPLETE
```
