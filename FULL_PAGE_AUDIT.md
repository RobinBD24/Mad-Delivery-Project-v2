# MAD Delivery HQ — Full Application Page-by-Page Audit

**Audit date:** 2026-07-28  
**Project root:** `/Users/whiteking/Desktop/Desktop/WebDevelopment/mad-delivery-hq`  
**Branch:** `main`  
**Initial Git status:** clean (`git status --short` returned no entries)  
**Current status:** IN PROGRESS — no page is considered verified until its inventory entry is `PASS`

## Safety boundary

- Work is limited to the project root above.
- Browser automation uses the isolated Playwright database (`prisma/test.db`), never `prisma/dev.db`.
- No deployment, PM2, Nginx, SSL, DNS, cron, systemd, firewall, Docker, production seed, Git commit, push, reset, clean, restore, checkout, stash, or rebase action is permitted.
- Existing features and historical data must be preserved. No feature may be removed, hidden, or replaced with mock data.
- Application changes are allowed only for defects reproduced during this audit. Each fix requires a failing regression test, a root-cause trace, targeted re-test, and related regression tests.

## Approved audit design

The audit uses a dynamic, reproducible inventory rather than a fixed route list.
Discovery combines:

1. App Router `page.tsx` / `page.ts` files, including groups and dynamic segments.
2. Navigation sources, `Link` targets, router navigation, redirects, notification links, sitemap, and robots references.
3. URLs referenced by Playwright tests and authentication fixtures.
4. Valid dynamic identifiers from the isolated seeded test database.
5. Runtime links discovered while authenticated as each role.

`test-artifacts/full-page-audit/page-inventory.json` is the source of truth for
progress. The audit resumes at the first non-`PASS` entry. `PASS` requires the
complete route-specific matrix; an HTTP 200 alone is insufficient.

## Execution plan

### Phase 1 — Inventory foundation

- Add a tested route-discovery utility that derives route patterns from the repository.
- Merge source-, navigation-, sitemap-, test-, and isolated-database discoveries.
- Emit deterministic inventory entries with every required result field initialized to `NOT TESTED`.
- Validate that no discovered route is silently dropped and that dynamic routes have concrete seeded URLs.

### Phase 2 — Reusable audit harness

- Add shared Playwright instrumentation for console errors, failed/unexpected responses, broken images, hydration errors, redirect/final URL capture, accessibility smoke checks, and failure evidence.
- Reuse the existing role authentication fixtures and isolated database.
- Support the required desktop/mobile viewport, locale, and theme combinations without global retries, arbitrary sleeps, forced clicks, or weakened assertions.

### Phase 3 — Sequential page audit

Audit in the requested order:

1. Public and authentication
2. Super Admin
3. Management
4. Marketing
5. Branch Manager
6. Accounts
7. Rider
8. Customer
9. Public catalogue and checkout
10. Dynamic detail/edit pages
11. Error, not-found, loading, unauthorized, and empty states
12. Cross-role and IDOR access
13. Remaining dynamically discovered routes

For each page: collect evidence, reproduce any defect, stop advancement, trace
the root cause, add a failing regression test, implement the smallest safe fix,
re-test the page, run related API/RBAC regressions, update the JSON inventory,
then continue.

### Phase 4 — Completion verification

- Confirm English/Bangla key parity.
- Run Prisma format, validate, generate, and migration status commands.
- Run the isolated seed, lint, production build, targeted tests, visual tests, and the complete Playwright suite once uninterrupted.
- Update `NEW_FEATURES_IMPLEMENTATION_AUDIT.md` while preserving its history.
- Record exact counts and all 81 requested final-report fields here.

## Progress

| Module | Pages checked | Defects found | Defects fixed | Tests added | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Inventory foundation | 161 discovered | 2 | 2 | 7 | n/a | 0 | 0 | 0 unresolved URLs |
| Public/auth | 12 | 3 | 3 | 7 | 12 | 0 | 0 | 0 |
| Super Admin | 33 | 27 | 27 | 58 | 33 | 0 | 0 | 0 |
| Other protected modules | 13 | 9 | 9 | 11 | 13 | 0 | 0 | 99 |
| Shared authenticated pages | 4 | 4 | 4 | 14 | 4 | 0 | 0 | 0 |

Current inventory totals: **161 route patterns**, **161 concrete URLs**, **62
PASS**, **0 FAIL**, **0 BLOCKED**, **99 NOT TESTED**. Dynamic patterns: **18**.

## Defect log

### Audit infrastructure

1. **Isolated test DB bootstrap failed**
   - Evidence: `npm run test:e2e:prepare` stopped at `Schema engine error` while
     resolving a missing `prisma/test.db`.
   - Root cause: Prisma 6.19.3 in this environment could open an existing empty
     SQLite file but did not create the missing file before migration status.
   - Fix: `scripts/ensure-test-db.mjs` creates only the project-local isolated
     file, rejects paths outside the project, and now runs before
     `db:test:deploy`.
   - Verification: regression tests **2/2 passed**; all **23 migrations**
     applied to `prisma/test.db`; isolated seed completed.

2. **The active development database was empty**
   - Evidence: the `yarn dev` homepage failed with Prisma `P2021` because
     `main.SystemSetting` did not exist. `.env` resolved to
     `file:./dev.db`; `prisma/dev.db` was a zero-byte SQLite file with no
     tables, and migration status reported all 23 migrations pending.
   - Root cause: the earlier browser audit intentionally used the isolated
     `prisma/test.db`, so it proved application behavior without verifying the
     separate database used by the live development command.
   - Fix: applied the repository's existing 23 migrations to `prisma/dev.db`
     with `prisma migrate deploy` (no reset), then ran the idempotent
     development seed.
   - Verification: migration status reports the schema up to date;
     `SystemSetting` has 3 rows, `User` has 12 rows, and all 23 migrations are
     recorded. The already-running localhost:3000 server returns HTTP 200 for
     `/`; the response contains no internal-server-error, `P2021`, or missing
     `SystemSetting` marker.

2. **Static sibling routes satisfied dynamic patterns**
   - Evidence: `/admin/branches/[id]` initially resolved to
     `/admin/branches/create`, and `/complaints/[id]` to `/complaints/new`.
   - Root cause: the first inventory matcher treated every single URL segment
     as a valid `[id]`, without excluding real static sibling routes.
   - Fix: static page patterns are excluded from dynamic concrete-URL
     resolution; role-scoped IDs are then read from `prisma/test.db`.
   - Verification: route-inventory tests **5/5 passed**; all **18 dynamic
     patterns** and all **161 total patterns** now have valid concrete URLs.

3. **Local E2E uploads inherited a deployment-only absolute path**
   - Evidence: all four existing image-upload tests failed with HTTP 500 and
     `ENOENT` while trying to create the stale `/home/labour_care/...` path.
   - Root cause: database and Auth URLs were isolated in Playwright, but
     `UPLOAD_DIR` was inherited from the relocated project’s `.env`.
   - Fix: Playwright now pins uploads to ignored project-local
     `test-artifacts/e2e-uploads`; the confirmed Mac development `.env` uses the
     documented relative `storage/uploads`. No upload was deleted.
   - Verification: exact upload retest **4/4 passed**, followed by the complete
     profile matrix **9/9 passed**.

### `/` — Homepage — PASS

1. **Visible search fields had no accessible names**
   - Evidence: the new audit test reported the global search and active-menu
     search as unnamed controls.
   - Root cause: localized placeholder text was used visually, but the inputs
     had no label, `aria-label`, or `aria-labelledby`.
   - Fix: reused the localized search strings as `aria-label` values on the
     desktop/mobile global search inputs and the menu search input.
   - Verification: the exact failing test now passes **1/1** with zero console,
     page, critical request, HTTP, broken-image, or raw-key errors.

2. **Darwin visual baselines used a non-isolated branch dataset**
   - Evidence: all three Darwin full-page images were 5–7% taller and showed
     more branches; current output exactly matched the isolated-seed Linux
     desktop/tablet dimensions and visual structure.
   - Root cause: the Darwin baselines were captured against different database
     contents, while the audit is required to use the deterministic isolated
     seed (three branches).
   - Fix: after inspecting expected, actual, and diff images, regenerated only
     the three Darwin homepage baselines to the already-approved isolated-seed
     state. No UI code or visual design was changed.
   - Verification: baseline update slice **3/3 passed**, followed by a clean
     no-update, no-retry homepage run **18/18 passed**.

Homepage evidence:

- Functional/design/visual suite: **18 passed**
- SEO/robots/sitemap/320–1440 responsive slice: **3 passed**
- Audit runtime/network/image/accessibility suite: **1 passed**
- Production build after the accessibility fix: success
- Total homepage browser checks: **22 passed, 0 failed**

### `/login` — Login — PASS

1. **Primary content had no main landmark**
   - Evidence: the page-audit test found zero `<main>` elements at 1440×900.
   - Root cause: the page’s top-level `auth-wrapper` was rendered as a plain
     `<div>`, even though it contains the page’s complete primary content.
   - Fix: changed only that wrapper element to `<main>`; classes, content,
     behavior, and layout are unchanged.
   - Verification: exact failing audit **1/1 passed** at 1440×900, 390×844, and
     320×568; related login design, validation, theme, seven-role destination,
     callback security, authenticated redirect, and noindex matrix **31/31
     passed** with retries disabled.

Login evidence:

- HTTP/final URL: `200`, `/login`
- Console errors: **0**
- Uncaught page errors: **0**
- Unexpected HTTP/critical request failures: **0**
- Broken images: **0**
- Form accessibility: labels and names present
- English/Bangla: PASS
- Light/dark: PASS
- Role/callback security: PASS

### `/register` — Customer registration — PASS

No application defect was found. The page was verified at 1440×900, 390×844,
and 320×568 in English/light and Bangla/dark states. The end-to-end flow rejects
public role spoofing, persists a unique customer in the isolated test database,
authenticates the new account, redirects it to `/customer/branches`, and rejects
duplicate identity data.

Registration evidence:

- Full page/runtime/accessibility/functional/API audit: **2/2 passed**
- Existing render and empty-submit validation regressions: **2/2 passed**
- Console and uncaught page errors: **0**
- Unexpected critical request/HTTP failures: **0**
- Broken images and unnamed visible form controls: **0**
- TypeScript no-emit check: PASS
- Framework-only observation: Chromium reports the completed Next.js Server
  Action RSC fetch as `ERR_ABORTED` after its successful action redirect. The
  audit permits only that exact POST + `next-action` + fetch signature; all
  other same-origin failures remain fatal.

### `/forgot-password` — Password reset — PASS

No application defect was found. The page passed desktop, mobile, and 320px
layout checks, English/light and Bangla/dark rendering, noindex metadata,
landmarks, form labels, back navigation, broken-image and runtime/network
checks. The existing functional suite also confirmed both invalid-identity
rejection and a successful reset followed by login using the isolated customer
account.

Password-reset evidence:

- Full page/runtime/accessibility/localization audit: **1/1 passed**
- Existing navigation, rejection, reset, and login regressions: **3/3 passed**
- Console, uncaught page, unexpected critical request, and HTTP errors: **0**
- Broken images and unnamed controls: **0**

### Legacy `/register/*` routes — 7/7 PASS

`/register/accounts`, `/register/branch-manager`, `/register/customer`,
`/register/management`, `/register/marketing`, `/register/rider`, and
`/register/staff` each return an explicit 307/308 redirect to `/register`.
Following every redirect lands on the audited customer registration page
without console, page, critical request, responsive-layout, or raw-key errors.
This confirms the intended RBAC rule that public registration cannot create
staff-role accounts.

### `/registration-pending` — Application status — PASS

No application defect was found. The localized status message, noindex metadata,
single main/heading structure, return-to-login link, desktop/mobile/320px
layout, English/light and Bangla/dark rendering, images, and runtime/network
signals all passed the targeted audit (**1/1 passed**).

### `/change-password` — Shared authenticated — PASS

No application defect was found. Anonymous page access redirects to login and
the anonymous API request returns 401; all seven seeded roles can render the
page inside their correctly scoped shared shell. An audit-only customer verified
the wrong-current-password error, a successful password change, and a successful
API restoration, so no seeded demo credential changed.

Change-password evidence:

- Final page audit plus existing shared-shell regression: **5/5 passed**
- Desktop, 390px, 320px, English/light, and Bangla/dark: PASS
- Accessible password fields, images, console, page, HTTP, and critical
  request checks: PASS
- TypeScript no-emit check: PASS
- Framework-only observation: zero to two completed Server Action RSC fetches
  may close with Chromium `ERR_ABORTED`; only the exact POST + `next-action` +
  fetch + `/change-password` signature is classified, and both submitted
  outcomes are asserted in the UI.

### `/complaints/[id]` — Shared complaint detail — PASS

1. **Reply textarea had no accessible name**
   - Evidence: the page audit found no associated label, `aria-label`, or
     `aria-labelledby` on the visible reply control.
   - Fix: reused the existing localized reply placeholder as an `aria-label`;
     visuals and behavior are unchanged.

2. **Complaint cards overflowed by 3px at 320px**
   - Evidence: the responsive audit measured `scrollWidth - clientWidth = 3`
     and traced both cards to a 309px implicit grid track ending at x=323.
   - Root cause: the mobile grid had no explicit column, so its implicit `auto`
     track honored min-content width rather than shrinking to the content area.
   - Fix: declared `grid-cols-1` for the mobile layout; the existing
     `lg:grid-cols-3` desktop layout is unchanged.

Complaint-detail evidence:

- Final page audit plus complaint/notification workflow: **5/5 passed**
- Owner, recipient branch manager, and super-admin access: PASS
- Anonymous redirect, unrelated-viewer not-found boundary, and API 403: PASS
- Reply validation, create/reply/status workflow, and status permissions: PASS
- Desktop/390px/320px, English/light, Bangla/dark, runtime, images, and noindex:
  PASS
- Targeted ESLint and production build: PASS

### `/complaints/new` — Shared complaint form — PASS

1. **Five visible labels were not connected to their controls**
   - Evidence: recipient, category, optional order, subject, and message all had
     visible `<label>` elements, but the labels had neither nesting nor matching
     `htmlFor`/`id` associations.
   - Fix: added stable, unique `id`/`htmlFor` pairs. Styling, field order,
     validation rules, available options, and submission behavior are unchanged.

New-complaint evidence:

- Final all-role/UI audit plus existing empty-submit regression: **4/4 passed**
- Anonymous page redirect and API 401: PASS
- All seven approved roles can render the form: PASS
- Empty validation and actual UI submission → new detail page: PASS
- Desktop/390px/320px, English/light, Bangla/dark, labels, runtime, images, and
  noindex: PASS
- Targeted ESLint and production build: PASS

### `/profile` — Shared profile — PASS

1. **Profile uploads returned HTTP 500 in the confirmed development workspace**
   - Evidence: Sharp conversion began correctly, then file persistence failed
     because `UPLOAD_DIR` still pointed at the former Linux project location.
   - Fix: the local development path is now project-relative, and Playwright
     has its own ignored upload root. Production/shared infrastructure was not
     modified; existing uploads were not removed.

Profile evidence:

- Final page/shell/upload/reload matrix: **9/9 passed**
- Exact isolated upload retest: **4/4 passed**
- Anonymous page/API denial and all seven authenticated roles: PASS
- Desktop/390px/320px, English/light, Bangla/dark, metadata, labels, validation,
  runtime, and images: PASS
- Audit-only UI profile update, API verification, and restoration: PASS
- PNG → WebP conversion, same-origin serving, reload survival, and topbar avatar:
  PASS

### `/admin/dashboard` — Super Admin dashboard — PASS

1. **Recent orders linked to customer-only detail pages**
   - Evidence: all five rendered recent-order rows had
     `/customer/orders/<id>` hrefs, which are outside the Super Admin route
     scope.
   - Root cause: the shared `OrderTable` was given
     `hrefBase="/customer/orders"` on the Super Admin dashboard.
   - Fix: changed only that route base to `/admin/orders`.
   - Verification: the exact failing link test passed, then the full dashboard
     regression matrix passed **13/13**.

Dashboard evidence:

- Anonymous and all six wrong-role page/API boundaries: PASS
- Real KPI, branch, recent-order, quick-action, and dependent API data: PASS
- Desktop/tablet/390px/320px, English/Bangla, light/dark, Asia/Dhaka clock,
  images, metadata, runtime/network, and error-boundary checks: PASS
- Targeted ESLint and production build: PASS

### `/admin/users` — Super Admin user list — PASS

1. **Blocked users displayed an Approved badge**
   - Evidence: the Blocked filter returned `blocked_customer` with
     `is_blocked: true`, but the status cell visibly read “Approved.”
   - Root cause: the list used only the account’s approval workflow status and
     ignored the independent blocked flag when rendering its status badge.
   - Fix: blocked state now takes display precedence in the user-list status
     cell; non-blocked accounts retain the existing approval-status badge.
   - Verification: the exact regression failed with `Expected "Blocked",
     Received "Approved"` before the fix, then the complete page audit passed
     **3/3** with retries disabled.

User-list evidence:

- Anonymous and all six wrong-role page/API boundaries: PASS
- Real isolated data, page-1/page-2 API pagination, UI pagination, search,
  combined role/status filters, URL state, clear-filters recovery, and row
  View/Edit URLs: PASS
- Delete confirmation was opened and cancelled; no delete endpoint was called
- 1440px/390px/320px, English/Bangla, light/dark, noindex, accessible toolbar,
  broken images, runtime/network, and horizontal overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/users/create` — Create user — PASS

- Empty-form client validation: PASS
- Real UI submission created a unique audit-only approved customer and
  redirected to its detail page; the user remains in `prisma/test.db`
- Anonymous and all six wrong-role page/POST boundaries: PASS
- 1440px/390px/320px, English/Bangla, light/dark, accessible form controls,
  noindex, images, runtime/network, and overflow: PASS

### `/admin/users/[id]` — User detail — PASS

1. **Blocked account detail omitted its blocked state**
   - Evidence: user `12` returned `is_blocked: true`, while the account card
     rendered only “Approved.”
   - Root cause: the detail page used the approval-only badge directly.
   - Fix: list and detail now share one account-status badge that gives blocked
     state display precedence.
   - Verification: the exact blocked-state regression passed.

2. **Confirmation dialog had no accessible name**
   - Evidence: Playwright could find the visible dialog but
     `getByRole("dialog", { name: /delete user/i })` found no element.
   - Root cause: the visual heading and description were not connected to the
     dialog with `aria-labelledby` / `aria-describedby`.
   - Fix: `ConfirmModal` now uses stable IDs to expose its existing title and
     description to assistive technology.
   - Verification: the named-dialog regression passed; the dialog was cancelled
     and the target user still returned HTTP 200.

Detail evidence:

- Approved and blocked real records, field data, Edit URL, and safe action
  presentation: PASS
- Missing-user API 404 and streamed visible Page-not-found boundary: PASS
- Anonymous and all six wrong-role page/GET boundaries: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, images,
  runtime/network, accessibility, and overflow: PASS

### `/admin/users/[id]/edit` — Edit user — PASS

1. **Optional fields could not be cleared**
   - Evidence: an edit changed the first name, but clearing Address and Gender
     left their previous values in the API response.
   - Root cause: the Server Action removed all empty strings before PATCH, and
     the route ignored empty optional phone/date values.
   - Fix: edit submissions preserve empty optional profile fields; PATCH now
     clears optional phone/date values explicitly, while an empty password still
     means “leave password unchanged.”
   - Verification: a new audit-only user was created with address/gender, edited
     through the UI, and re-read with both fields empty. The combined
     create/detail/edit matrix passed **4/4** with retries disabled.

Edit evidence:

- Disabled immutable username, populated values, UI update, persisted clearing,
  redirect, and detail reload: PASS
- Anonymous and all six wrong-role page/PATCH boundaries: PASS
- 1440px/390px/320px, English/Bangla, light/dark, accessible form controls,
  noindex, runtime/network, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/activity-logs` — Manager activity audit — PASS

1. **Malformed optional filters crashed the API**
   - Evidence: `manager=not-a-number&branch=also-invalid` returned HTTP 500,
     with Prisma rejecting `managerId: NaN` / `branchId: NaN`.
   - Root cause: raw query strings were passed through `Number()` without
     checking for positive safe integers; activity type was also unconstrained.
   - Fix: manager/branch IDs are applied only when they are positive safe
     integers, and activity type is applied only for login/logout/action.
   - Verification: the exact malformed query now returns 200, valid action
     filtering still works, and the complete page matrix passed **3/3**.

Activity-log evidence:

- Real audit record, manager/branch/type/description/IP/time table data, action
  filter, invalid page query, and malformed API filters: PASS
- Page denied to anonymous and all six wrong roles; related API correctly
  allows Management and self-scoped Branch Manager while denying the other
  four roles: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime/network,
  accessibility, and horizontal overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/branch-manager-history` — Manager assignments — PASS

1. **Malformed numeric filters crashed the API**
   - Evidence: `manager=bad&branch=invalid` returned HTTP 500 with Prisma
     validation errors for `managerId: NaN` / `branchId: NaN`.
   - Root cause: optional filter strings were converted without validating
     positive safe integers.
   - Fix: invalid IDs are ignored before constructing the Prisma query.
   - Verification: the exact malformed request now returns 200; valid active
     filtering and scoped access still work; the full page matrix passed
     **3/3**.

Manager-history evidence:

- Real assignment manager, branch, dates, duration, assigner, active badge,
  active filter, invalid page query, and malformed filters: PASS
- Page denied to anonymous and all six wrong roles; related API correctly
  allows Management and self-scoped Branch Manager while denying the other
  four roles: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime/network,
  accessibility, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/branches` route family — List/create/detail/edit — 4/4 PASS

1. **Manager-assignment controls were unnamed**
   - The detail select and note input now reuse localized accessible names.
2. **Active checkbox did not represent its submitted value**
   - Evidence: creating with the visible checkbox unchecked still produced
     `is_active: true`.
   - The form now submits explicit `false` and checked `true` values for both
     create and edit.
3. **Inactive-branch direct-ID visibility bypass**
   - Evidence: the inactive audit branch was absent from the Customer list but
     `/api/branches/<id>` still returned 200 to that Customer.
   - Customer/Rider detail reads now enforce the same active/non-archived rule
     and return 404, while staff access is unchanged.

Branch-family evidence:

- Real list rows, status/brand data, View/Edit/New URLs, detail fields,
  assignment/history panels, named delete/archive warnings, and cancel-only
  destructive dialogs: PASS
- Additive UI workflow created an inactive audit branch, verified customer
  invisibility, cleared its optional email, reactivated it, and retained it
- Anonymous and all six wrong-role pages/mutations denied; read-only active
  branch API remains intentionally shared: PASS
- Not-found boundary, 1440px/390px/320px, English/Bangla, light/dark, noindex,
  runtime, accessibility, and overflow: PASS
- Combined Playwright matrix **4/4**, targeted ESLint, TypeScript no-emit, and
  production build: PASS

### `/admin/categories` — Product categories — PASS

1. **Category form labels were disconnected**
   - Evidence: Branch, Category name, and Description were visible, but
     label-based control lookup found none of them.
   - Root cause: plain sibling `<label>` elements had no `htmlFor`/control IDs.
   - Fix: associated all three existing labels directly with their controls.
   - Verification: the exact accessibility regression and complete page matrix
     passed **3/3**.

Category evidence:

- Real branch/global scopes, product counts, statuses, malformed branch query,
  and additive global category creation: PASS
- Named deactivate/delete outcome dialogs opened and were cancelled; the
  audit-only category remains present
- Anonymous and all six wrong-role page/mutation boundaries denied; read API
  intentionally shared: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/complaints` — Super Admin complaint list — PASS

1. **Inbox leaked complaints for other recipient roles**
   - Evidence: `box=inbox` included Branch Manager and Accounts complaints.
   - Root cause: Super Admin’s intentionally broad base scope was not narrowed
     by recipient when Inbox was selected.
   - Fix: Super Admin Inbox now applies `recipientRole = super_admin`; other
     roles retain their existing scoped behavior.
   - Verification: the exact API assertion and All/Inbox/Sent/status UI matrix
     passed **3/3**.

Complaint-list evidence:

- Real cards, shared detail URLs, new-complaint URL, exact box/status query
  links, API result counts, and recipient scoping: PASS
- Admin page denied to anonymous and all six wrong roles; each role’s shared
  complaint API remains available with its own scope: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/customers` and `/admin/customers/blocked` — 2/2 PASS

- Real customer/contact/order/join/status data and blocked reason data: PASS
- Blocked-list / All-customers navigation and block-reason validation: PASS
- A new audit-only customer completed a reversible API block cycle: the reason
  persisted, the row appeared on the blocked page, unblock cleared both state
  and reason, the row disappeared, and the customer record remains present
- Both pages and block/unblock APIs denied to anonymous and all six wrong
  roles: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Combined Playwright matrix **3/3**

### `/admin/delivery-areas` — Delivery area management — PASS

1. **Inline edit fields were unnamed**
   - Evidence: edit mode rendered three inputs with empty accessible names.
   - Root cause: table headers described their columns visually, but the
     replacement inputs had no label or `aria-label`.
   - Fix: reused localized Area name, Delivery time, and Delivery charge labels
     as accessible names.
   - Verification: the exact regression and complete page matrix passed
     **3/3**.

Delivery-area evidence:

- Real branch areas, status/charge/time data, held API filter, branch filter,
  add form, and inline edit/cancel: PASS
- Additive audit-only area creation plus UI Hold → API verification → Resume →
  restored verification: PASS
- Admin page protected; Branch Manager retains own-branch API scope; all other
  wrong roles denied: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/notices` — Broadcast notices — PASS

1. **Composer labels were disconnected**
   - Evidence: Title, Audience, and Body were visible but label-based locators
     could not find the controls.
   - Fix: added direct `htmlFor`/ID associations for all three.
   - Verification: exact regression and complete matrix passed **3/3**.

Notice evidence:

- Real broadcast audience/reach/author/time data and additive customer-targeted
  notice publication: PASS
- Customer received the targeted notice; Rider did not; named delete dialog
  was cancelled and the notice remains
- Admin page protected; read visibility role-targeted; Marketing compose scope
  retained; deletion Super Admin-only: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Targeted ESLint, TypeScript no-emit, and production build: PASS

### `/admin/notifications` — Super Admin notifications — PASS

1. **Complaint notifications opened nonexistent role-prefixed detail routes**
   - Evidence: real Super Admin complaint notifications linked to
     `/branch-manager/complaints/<id>`; after the first producer correction,
     `/admin/complaints/<id>` rendered the not-found boundary as well.
   - Root cause: complaint detail is implemented only at the canonical shared
     `/complaints/[id]` route, while the notification producer constructed
     role-prefixed detail URLs that do not exist.
   - Fix: new complaint notifications use `/complaints/<id>`. Serialization
     normalizes legacy Admin, Branch Manager, Accounts, Management, and
     Marketing complaint links at read time, preserving stored rows while
     making old notifications usable.
   - Verification: audit-created complaints produced one deduplicated
     notification per recipient, both Admin and Branch Manager APIs returned
     the canonical URL, the browser opened the real detail page, and legacy
     complaint links serialized canonically.

2. **Notification filter selection was only visual**
   - Evidence: All/Unread/Read buttons changed styling but exposed no selected
     state to assistive technology.
   - Fix: each filter button now publishes its active state with
     `aria-pressed`.
   - Verification: the accessibility regression asserts the initial All state
     and the changed Unread state.

Notification evidence:

- Real user-scoped inbox data, All/Unread/Read filtering, canonical complaint
  navigation, and read-state transition on only the audit-created row: PASS
- Admin page denied to anonymous and all six wrong roles; shared authenticated
  inbox API remained available and session-scoped for every role: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### `/admin/orders` — All-orders list — PASS

1. **Malformed branch filters crashed the shared orders API**
   - Evidence: `/api/orders?branch=not-a-number` returned HTTP 500, with Prisma
     rejecting `branchId: NaN`.
   - Root cause: the optional branch query string was converted with `Number()`
     and added to the Prisma filter without validating the result.
   - Fix: branch filtering is applied only for positive safe integers; malformed
     values are ignored and preserve the caller’s existing role scope.
   - Verification: the exact malformed query now returns the same all-order
     count to Super Admin, while a valid pending-status filter still returns
     only pending orders.

Orders-list evidence:

- Real order number, customer/contact, branch, status, payment, total/time data,
  row count, and every `/admin/orders/<id>` detail link: PASS
- Admin page denied to anonymous and all six wrong roles; Management/Accounts
  retain oversight scope, Branch Manager/Rider/Customer remain scoped, and
  Marketing remains empty: PASS
- Non-customer order creation stayed forbidden; the customer creation endpoint
  was not invoked, keeping this page audit read-only
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### `/admin/orders/[id]` — Read-only order detail — PASS

1. **Malformed order IDs crashed the detail API**
   - Evidence: `/api/orders/not-a-number` returned HTTP 500, with Prisma
     rejecting `id: NaN`.
   - Root cause: the path segment was converted with `Number()` inside the
     Prisma query without first validating it.
   - Fix: the detail route accepts only positive safe integer IDs and returns
     the existing localized order-not-found 404 for malformed values.
   - Verification: malformed and absent numeric IDs both return 404, while a
     real record remains 200 and the missing browser URL renders the not-found
     boundary.

Order-detail evidence:

- Real order number/status timeline, items and snapshots, totals, customer,
  address, payment, rider, branch/time data, and back navigation: PASS
- Super Admin view contains no status/payment mutation controls
- Admin page denied to anonymous and all six wrong roles; each shared detail
  API result exactly matches whether the same record appears in that role’s
  scoped order list: PASS
- 1440px/390px/320px, English/Bangla, light/dark, noindex, images, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### `/admin/products` route family — List/create/edit/deactivated — 4/4 PASS

1. **Product API pagination was metadata-only**
   - Evidence: `page_size=1` returned all five seeded products.
   - Root cause: page parameters were parsed but `productsForUser` results were
     never sliced.
   - Fix: preserve the full filtered count and return only the requested
     `skip/take` window.
2. **Malformed product filters and IDs could reach Prisma**
   - Optional branch/category filters and product path IDs now apply only when
     they are positive safe integers; malformed detail IDs return the existing
     localized 404. The edit page uses the same controlled not-found boundary.
3. **Direct product reads bypassed catalogue visibility**
   - Evidence: the detail handler required authentication but did not apply
     branch ownership, availability, hold, deletion, category, or branch
     visibility rules.
   - Fix: Super Admin retains all-record access, Branch Manager uses the
     management ownership guard, and all other roles resolve through the same
     visibility selector used by their product lists.
4. **Adjacent hold/unhold/availability mutations accepted unsafe IDs**
   - All three now reject malformed IDs before database access, preserving
     their existing role and state-transition rules.

Product-family evidence:

- Exact all-product and deactivated rows, branch/brand/category/variation/price/
  status data, edit/create navigation, and cancel-only delete dialog: PASS
- Additive UI create persisted a valid default variation; additive edit
  preserved unavailable state while updating name/description; both records
  remain in `prisma/test.db`
- Customer direct ID could not reveal the unavailable audit product; Branch
  Manager could not reveal a foreign-branch product; all four Admin pages and
  governance mutations denied all six wrong roles
- No product was held, released, or deleted during this page audit
- Four pages at 1440px/390px/320px, English/Bangla, light/dark, noindex,
  runtime, accessibility, and overflow: PASS
- Production build: PASS; page-family matrix **5/5** and existing variation/
  brand/IDOR/history regressions **6/6** passed with retries disabled

### `/admin/reports` route family — Overview/attendance/cancellations/orders/sales — 5/5 PASS

No application defect was found.

Report-family evidence:

- Overview KPIs, exact navigation, branch performance, and order-status
  aggregates matched the real Super Admin dashboard API
- Today’s orders, 30-day cancellations, cancellation-loss copy, delivered
  sales, branch/product groupings, and all Today/7-day/30-day links: PASS
- The isolated database has no recent rider-duty or manager-login rows; both
  attendance panels rendered their genuine localized empty state with zero
  table rows
- All five pages and the dashboard data API denied anonymous and all six wrong
  roles: PASS
- Five pages at 1440px/390px/320px, English/Bangla, light/dark, noindex,
  runtime, accessibility, and overflow: PASS
- Combined Playwright matrix **3/3 passed** with retries disabled

### `/admin/rewards` — Reward configuration and earning rules — PASS

1. **Reward inputs did not expose accessible names**
   - Evidence: coin value and minimum redemption labels were not associated
     with their inputs, and each per-activity coin input had no programmatic
     name.
   - Fix: linked the two configuration labels with stable input IDs and added
     a localized activity-specific accessible label to every earning-rule
     input.
2. **Malformed reward-rule IDs reached Prisma**
   - Evidence: `/api/admin/reward-rules/not-a-number` returned HTTP 500 because
     Prisma received `id: NaN`.
   - Fix: GET, PATCH, and DELETE now accept only positive safe integer IDs and
     return the existing 404 boundary for malformed values.

Rewards evidence:

- Real program status, coin value, minimum redemption, and earning-rule data
  matched the protected APIs
- Pause-program confirmation and the new-rule form were opened and cancelled;
  the isolated program remained active and no rule was created or deleted
- Page and reward-management APIs denied anonymous and all six wrong roles
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### `/admin/settings`, `/admin/settings/delivery-fees`, and `/admin/staff` — 3/3 PASS

1. **Settings inputs were not programmatically labelled**
   - Evidence: the company-logo file picker and per-delivery commission input
     could not be located by their visible purpose through the accessibility
     tree.
   - Fix: the logo picker now has a localized accessible name and the
     commission label is explicitly associated with its input.
2. **Global logo removal had no confirmation boundary**
   - Evidence: clicking Remove immediately deleted the platform-wide logo.
   - Fix: removal now opens the shared localized danger confirmation dialog;
     cancel closes it without issuing the DELETE request.

Final Super Admin evidence:

- Settings shortcuts, real logo state, real commission and rider-earning
  aggregates, and the complete staff directory matched protected live data
- Empty-file upload and negative-commission validation rendered localized
  errors; the commission API value was unchanged after invalid submission
- All three pages and both Admin settings APIs denied anonymous and all six
  wrong roles
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### Branch Manager operations — dashboard/reports/attendance/duty history/riders — 5/5 PASS

1. **Attendance omitted the supported “Others” employee role**
   - Evidence: employees created with the valid `others` role rendered in the
     roster but could not be selected through the role filter.
   - Fix: the filter now includes the existing localized Others option.
2. **Malformed attendance and employee filters could reach Prisma**
   - Evidence: invalid date filters produced `Invalid Date` query values and
     `/api/employee-attendance?...from=wrong` returned HTTP 500. Adjacent
     employee identifier/date filters had the same unsafe parsing pattern.
   - Fix: optional branch/employee/team identifiers now accept only positive
     safe integers, and date filters accept only real canonical YYYY-MM-DD
     values; malformed filters are ignored without widening the caller’s
     branch scope.

Branch Manager operations evidence:

- Dashboard branch identity, live snapshot, six operational chips, four KPIs,
  recent-order links, weekly reports, and popular items matched own-branch APIs
- Attendance roster and summary, manager assignment/activity history, assigned
  riders, and on-duty chat rows matched their scoped live endpoints
- All five pages denied anonymous and every wrong role; shared oversight APIs
  retained their intentional Super Admin/Management access while branch-only
  chat remained Branch Manager-only
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **4/4 passed** with retries
  disabled

### Branch Manager catalog — list/category redirects/product create/edit — 5/5 PASS

1. **Product availability prompt was not accessible or cancel-safe**
   - Evidence: Disable revealed a visually prompted reason input with no
     accessible name and no way to dismiss the pending action.
   - Fix: the reason input now exposes its localized purpose and a Cancel
     control clears the draft without invoking the mutation.
2. **Malformed product edit IDs reached Prisma**
   - Fix: the edit page validates positive safe integer IDs before querying and
     renders the controlled not-found boundary.
3. **Adjacent category-status IDs used unsafe numeric conversion**
   - Fix: the status endpoint now uses the shared validated ID parser before
     the Super Admin-only service.

Catalog evidence:

- Exact own-branch product rows, categories, search/filter links, prices,
  availability, variations, and create/edit form values matched scoped APIs
- Former Branch Manager category create/edit URLs redirect to the catalog, and
  category POST/PATCH remain forbidden; no category action is rendered
- Product create/edit validation and cancel links passed; availability disable
  was opened and cancelled, with no catalogue mutation
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime, images,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **3/3 passed** with retries
  disabled

### Branch Manager delivery areas/hours/zone — 3/3 PASS

1. **Delivery-hour and slot inputs had disconnected labels**
   - Fix: opening, closing, slot label, start, and end labels now target stable
     input IDs.
2. **Malformed coordinates and resource IDs caused server errors**
   - Evidence: invalid latitude/longitude produced a Prisma Decimal `NaN` and
     HTTP 500. Malformed time-slot and delivery-zone path IDs could likewise
     reach Prisma.
   - Fix: coordinates are finite and range-checked; time-slot/zone path IDs
     accept only positive safe integers and return 404. Optional zone branch
     IDs are also safely parsed.
3. **Named-zone creation silently forced the delivery fee to zero**
   - Evidence: fee state existed and the API supported it, but no fee input was
     rendered.
   - Fix: the localized delivery-charge input is now present in the creation
     form and feeds the existing payload.
4. **Zone deletion had no confirmation**
   - Fix: the existing delete action is now behind the shared localized danger
     confirmation; cancel issues no DELETE request.

Delivery-configuration evidence:

- Exact own-branch delivery areas, opening/closing times, slots, coverage,
  pickup settings, and named zones matched the live APIs
- Empty area/slot and invalid radius/coordinate validation paths executed
  without changing stored data; edit and both delete dialogs were cancelled
- All three pages and Branch Manager settings/slot APIs denied anonymous and
  every wrong role
- 1440px/390px/320px, English/Bangla, light/dark, noindex, runtime,
  accessibility, and overflow: PASS
- Production build: PASS; final Playwright matrix **4/4 passed** with retries
  disabled
