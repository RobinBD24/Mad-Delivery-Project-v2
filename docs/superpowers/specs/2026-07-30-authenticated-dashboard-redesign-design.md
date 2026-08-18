# MAD Delivery HQ Authenticated Dashboard Redesign

Date: 2026-07-30  
Project: `/Users/whiteking/Desktop/Desktop/WebDevelopment/mad-delivery-hq`  
Status: Approved for implementation planning

## 1. Objective

Modernize every authenticated MAD Delivery HQ page without changing routes, business rules, API contracts, database schema, validation, permissions, ownership, or workflow behavior.

In scope:

- Super Admin
- Management
- Marketing
- Branch Manager
- Accounts
- Rider
- Customer authenticated pages
- Shared authenticated pages such as profile, password, and complaint detail/create

Out of scope:

- Public homepage, menu, catalogue, product, branch, legal, SEO, and information pages
- Authentication/business-rule redesign
- Schema or migration changes
- Deployment or infrastructure work

The route inventory covers 153 authenticated pages: 149 role-prefixed pages and 4 shared authenticated pages.

## 2. Scope Decomposition

The redesign is too large to treat as one unstructured edit. Implementation is divided into bounded waves that share one design system:

1. Route inventory and authenticated design tokens
2. Shell, sidebar, topbar, page header, breadcrumbs, and responsive content frame
3. Summary, filter, table/mobile-list, action, empty, loading, and error primitives
4. Reports proof page and Super Admin/Branch Manager rollout
5. Rider mobile-first rollout and Customer authenticated rollout
6. Management, Marketing, and Accounts rollout
7. Create/edit/detail refinement
8. Full theme, locale, responsiveness, accessibility, and regression verification

Each wave must preserve existing dirty work and leave public pages unchanged.

## 3. Visual Direction

### Product character

MAD Delivery HQ is a restaurant delivery operations control room. Visual language should feel fast, disciplined, and operational rather than generic corporate SaaS.

### Signature element

The existing live status rail becomes the design signature: a quiet dispatch rail under the topbar. It uses real state only, stays static except for the existing clock/live indicator, and changes emphasis by role:

- MAD red for system actions
- Rider green for duty/availability
- Kitchen amber for pending/preparing work
- Information blue for branch/content context

No decorative route animation, fake live state, or constant moving icon is introduced.

### Palette

Existing semantic tokens remain the source of truth and are expanded, not replaced:

- MAD Signal Red: `#e8192c`
- Operations Ink: `#16213e`
- Rider Active Green: `#22c55e`
- Kitchen Warning Amber: `#f59e0b`
- Information Blue: `#3b82f6`
- Neutral page/surface/text tokens remain theme-dependent

Strong red is reserved for brand emphasis, urgent state, and destructive actions. Large surfaces remain neutral.

### Typography

Keep project-safe fonts:

- Sora plus Bengali fallback for headings and metric values
- Inter plus Bengali fallback for body and controls
- JetBrains Mono plus Bengali fallback for order IDs, financial figures, times, and tabular data

No external font dependency is added.

### Density and shape

- Page spacing: compact operational rhythm, not oversized marketing spacing
- Surface radius: 14–18px for sections, 10–12px for controls
- Input/button height: minimum 40px; Rider primary actions minimum 48px
- Borders: subtle semantic borders
- Shadows: soft elevation only for floating menus, modals, and selected primary panels
- Motion: short color/transform transitions; reduced-motion respected

## 4. Shared Architecture

### Server-first boundary

Pages and summary data stay server-rendered where possible. Client components are limited to:

- Drawer/sidebar state
- Menus, dialogs, tabs, and filter drawers
- Existing live/polling workflows
- Rider GPS, assignment, chat, and duty controls

No shared visual primitive becomes a client component without interaction need.

### Shared component families

#### Layout

- `DashboardShell`
- `DashboardSidebar`
- `DashboardTopbar`
- `DashboardStatusBar`
- `DashboardPage`
- `DashboardPageHeader`
- `DashboardBreadcrumbs`
- `DashboardSection`
- `SectionHeader`

#### Summary

- `SummaryCard`
- `SummaryCardGrid`
- `SummaryCardSkeleton`
- `SummaryCardError`
- Compatibility path for existing `StatCard` and `StatChip`

#### Search and filtering

- `FilterBar`
- `SearchField`
- `FilterSelect`
- `ActiveFilterChips`
- `MobileFilterDrawer`

Query state uses validated URL search parameters. Large or paginated datasets use server-side filtering. Existing branch and role scope remains authoritative.

#### Data presentation

- `ResponsiveDataView`
- Existing `Table` refined for desktop
- `MobileDataCard`
- `TableActionsMenu`
- `Pagination` refinement
- `StatusBadge`
- `ActivityTimeline`

Desktop and mobile presentations share the same source data and actions. Mobile cards pin identity, status, important metadata, and touch-friendly actions.

#### States and feedback

- `EmptyState` variants: no data, no search result, filtered result, restricted, unavailable
- `DashboardErrorState`
- `InlineErrorState`
- `LoadingSkeleton`
- `TableSkeleton`
- `DetailSkeleton`
- Existing confirmation modal refined into accessible confirmation dialog

Errors are never converted into fake empty arrays or zero metrics.

## 5. Shell Design

### Desktop

- Sidebar remains role-aware and permission-safe.
- Sidebar width becomes visually tighter while preserving long Bangla labels.
- Groups remain explicit.
- Active route receives clear rail, icon, and surface treatment.
- Topbar remains sticky and contains notifications, theme, locale, and profile controls.
- Content receives a consistent maximum readable width while wide operational tables can use full available width.
- Desktop sidebar collapse is allowed only if labels, keyboard access, tooltip behavior, and navigation discoverability remain correct.

### Mobile

- Sidebar remains a drawer with focus-safe close behavior.
- Topbar keeps menu, product identity, notifications, and profile access without wrapping into multiple rows.
- Page actions move below the title when width requires.
- No page-level horizontal overflow.
- Mobile data cards replace crushed desktop tables.

### Breadcrumbs

Breadcrumbs are derived from known route labels, not raw path fragments. They are shown on nested detail/create/edit pages and omitted where redundant.

## 6. Page Patterns

### Dashboard

Order:

1. Header and role/branch identity
2. Critical operational state
3. Four primary metrics maximum before secondary content
4. Quick actions
5. Charts, pipeline, alerts, and recent activity

Dashboards avoid duplicate chip and card totals when both convey the same information.

### List/management page

Order:

1. Page header
2. Three to five useful summary cards
3. Search/filter bar
4. Active filter chips and results count
5. Desktop table or mobile cards
6. Pagination
7. Contextual empty/error/loading state

Summary cards use complete authorized aggregates, never current-page counts.

### Detail page

Order:

1. Breadcrumb/back action
2. Identity, status, and valid actions
3. Compact context metrics
4. Key details grid
5. Related records/history
6. Destructive actions separated visually

### Create/edit page

Order:

1. Breadcrumb and page header
2. Optional compact context
3. Grouped form sections with descriptions
4. Responsive columns
5. Existing validation messages
6. Clear Save and Cancel actions

No dashboard-style metric wall is added to forms.

## 7. Summary Data Rules

- One page/domain summary service combines related aggregates.
- Independent aggregates run in parallel.
- Branch Manager scope is resolved from authenticated manager identity.
- Rider and Customer scope always uses authenticated user identity.
- Super Admin, Management, Marketing, and Accounts receive only permitted domain metrics.
- Submitted branch IDs never widen scope.
- Financial values remain Prisma Decimal or serialized decimal strings until formatted.
- Existing formatters handle currency, count, percentage, date, and locale.
- No fake trend, estimated total, or pagination-derived count is allowed.
- Existing estimated Rider order-history earnings must be replaced by real commission data during its page redesign.
- Cards become links only when a valid URL filter/navigation target exists.

## 8. Search and Filter Rules

- Search input trims whitespace and supports partial, case-insensitive matching where the existing database supports it.
- Status, branch, role, and date query parameters are allow-listed.
- Sorting uses explicit field mappings; raw sort fields never enter Prisma.
- Changing filters resets pagination where required.
- Clear All removes only page filter parameters.
- Branch filters appear only for roles allowed to view multiple branches.
- No client filtering of incomplete paginated results.

## 9. Rider Experience

Rider workflow remains distinct from administrative roles.

### Mobile priority order

1. Online/offline, duty branch, GPS/network state
2. Blocking pending assignment
3. Active delivery identity and current step
4. Customer address, route, call/chat, and pickup/delivery actions
5. Completed today and essential earnings
6. Duty controls, history, notifications, and secondary details

### Interaction rules

- Primary actions are large and reachable with one hand.
- Critical assignment controls remain outside overflow menus.
- Assignment gate behavior, GPS tracking, chats, confirmations, and status transitions remain unchanged.
- Active order remains visually discoverable on every Rider page through existing navigation/context, without adding new business state.
- Offline and GPS-denied states use text plus color and remain high contrast outdoors.
- Desktop keeps a wider operational layout; mobile is canonical.

## 10. Customer Experience

Authenticated customer pages remain friendly and lower-density:

- Active order and Order Now receive priority.
- Recent orders, addresses, rewards, reservations, payments, and notifications use larger touch-friendly cards.
- System-wide metrics never appear.
- Public ordering pages and nearest-branch logic remain unchanged.

## 11. Role-specific Emphasis

### Super Admin

System health, approvals, branches, order pipeline, payments, and recent activity. Avoid an undifferentiated statistics wall.

### Branch Manager

Branch identity, operational status, orders, riders, employees, attendance, delivery coverage, and permitted payments. All values are own-branch only.

### Management

Read-only executive summaries, branch performance, orders, riders, staff, reservations, finance, and reports. No unauthorized actions.

### Marketing

Campaigns, notices, coupons, audience, rewards, feedback, and scheduled content. No invented engagement analytics.

### Accounts

Verification, paid/COD/rejected/refunded states, settlements, reconciliation, earnings, and reports. Financial hierarchy and Decimal safety receive priority.

## 12. Loading, Error, and Empty Behavior

- Route loading uses content-shaped skeletons instead of one large spinner where practical.
- Summary skeleton dimensions match final cards.
- Table skeletons preserve column and row rhythm.
- Partial summary failures render an inline summary error while primary page content remains available.
- Full-page error appears only when page cannot render.
- Retry controls reuse existing route refresh/reset behavior.
- Error UI never exposes Prisma messages, stack traces, local paths, or secrets.
- Empty states distinguish no data from no results.

## 13. Accessibility

- Semantic landmarks and heading order
- Visible keyboard focus
- Semantic links/buttons for interactive cards
- Focus trapping and restoration in dialogs/drawers
- Escape behavior and safe outside-click behavior
- Status text in addition to color
- Decorative icons hidden from assistive technology
- Minimum touch targets
- Long English/Bangla wrapping
- Reduced-motion support
- No inaccessible icon-only destructive controls

## 14. Performance

- Preserve intent-based route prefetch.
- Avoid one request/query per card.
- Avoid new full-page polling.
- Reuse existing live-data hooks only for operational values.
- Keep heavy maps/charts lazy or conditional.
- Avoid animation/image libraries.
- Keep visual primitives server-rendered.
- Replace known N+1 aggregate patterns when directly touched by summary rollout.
- Public bundle and public routes remain unaffected.

## 15. Route Audit

`DASHBOARD_UI_REDESIGN_AUDIT.md` records every authenticated route with:

- Route
- Role
- Page type
- Current layout
- Summary requirement
- Search/filter requirement
- Desktop/mobile presentation
- Actions
- Empty/loading/error state
- Final status

Allowed final statuses:

- `REDESIGNED`
- `EXISTING_DESIGN_REFINED`
- `NOT_NEEDED`

`NOT_NEEDED` requires a concrete reason and is expected mainly for shared utility pages whose existing design already meets the standard.

## 16. Testing Strategy

### Static checks

- Changed-file lint during rollout
- TypeScript/build after shared-system and final waves
- EN/BN exact key parity

### Focused behavior tests

- Role navigation and permissions
- Branch Manager own-branch summaries and filters
- Rider own assignment/delivery/duty data
- Customer own orders/rewards/addresses
- Financial formatting and totals
- Search/filter URL behavior
- Dialog/menu keyboard behavior
- Empty/loading/error behavior

### Visual/browser checks

Widths: 320, 360, 375, 390, 414, 768, 1024, desktop.

Coverage:

- Light and dark
- English and Bangla
- Dashboard, dense list, detail, form, modal
- Rider offline, online, pending assignment, and active delivery
- Customer active-order flow

Existing visual baselines are inspected before any update. Public visual baselines are not regenerated.

## 17. Safety and Preservation

- No Git commit, push, pull, reset, clean, checkout, restore, stash, or rebase
- No database reset, force reset, destructive SQL, production seed, or schema change
- No PM2, Nginx, SSL, DNS, cron, systemd, firewall, Docker, or deployment action
- No sibling project access
- No public-page design changes
- Existing uncommitted Delivery Areas work is preserved

## 18. Acceptance Criteria

Implementation is complete only when:

1. All 153 authenticated pages are recorded in the audit.
2. Every appropriate list/dashboard page uses the shared summary and page patterns.
3. Meaningful lists use validated search/filtering and responsive desktop/mobile presentation.
4. Detail and form pages use shared authenticated layouts.
5. Rider mobile workflows remain fully available and visually prioritized.
6. Public pages and public visual baselines remain unchanged.
7. Existing actions, routes, APIs, RBAC, ownership, validation, and business rules remain unchanged.
8. Light/dark and EN/BN pass focused visual checks.
9. No fake or unauthorized metric is introduced.
10. Build, lint, translations, and focused tests pass, or remaining failures are reported with evidence.

