# Delivery Areas Management Implementation Plan

> **Execution note:** Work only in `/Users/whiteking/Desktop/Desktop/WebDevelopment/mad-delivery-hq`. The brief's `/home/labour_care/...` path is not this live workspace; the user previously confirmed the macOS path. Preserve existing changes. Do not commit, push, pull, reset, restore, checkout, clean, stash, deploy, restart services, or run destructive database commands.

**Goal:** Turn Delivery Areas into a fast, role-safe list-management module with dedicated Add/Edit routes, server-side query controls, responsive results, and preserved business rules.

**Architecture:** Both role routes will render shared Server Components and small Client Components. Pages fetch authenticated initial data directly from Prisma-backed services. A client-safe typed query module validates URL state; a server-only service converts that state to fixed Prisma filters/order clauses. The explorer fetches only the current page through the existing Route Handler, while shared Add/Edit forms use the existing authorized REST mutations.

**Stack:** Next.js 16.2 App Router, React 19, TypeScript, Prisma 6/SQLite, Tailwind CSS 4, project i18n/validation/UI primitives, Playwright.

**Approved design:** `docs/superpowers/specs/2026-07-30-delivery-areas-management-design.md`

**Verification discipline:** Every behavior change starts with a focused Playwright assertion that fails for the intended reason. After implementation, rerun that focused assertion. At each checkpoint run `git diff --check` and inspect `git status --short`; do not create commits.

---

## 1. Inspect current routes, services, selectors, APIs, and components

**Read only:**

- `app/(dashboard)/admin/delivery-areas/page.tsx`
- `app/(dashboard)/branch-manager/delivery-areas/page.tsx`
- `components/delivery/delivery-areas-manager.tsx`
- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/route.ts`
- `app/api/delivery-areas/[id]/route.ts`
- `app/api/delivery-areas/[id]/hold/route.ts`
- `app/api/delivery-areas/[id]/resume/route.ts`
- `prisma/schema.prisma`

**Completed findings:**

- One oversized client component owns create, client filtering, unlimited results, inline edit, and Hold/Resume.
- One `BranchDeliveryArea` model and one role-aware service already protect ownership and immutable order snapshots.
- List GET currently loads every visible row; PATCH omits active-state updates.
- No schema or migration change is needed.

## 2. Identify reusable table, filter, pagination, dialog, and form components

**Reuse:**

- `components/layout/page-header.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/table.tsx`
- `components/ui/badge.tsx`
- `components/ui/empty-state.tsx`
- `components/ui/confirm-modal.tsx`
- `components/layout/icons.tsx`
- `lib/validation/*`
- URL/list interaction pattern from `components/dashboard/users/users-explorer.tsx`

**Decision:** Create Delivery-Area-specific explorer, form, skeleton, and client-safe query modules. Do not generalize unrelated shared components unless a tiny backward-compatible responsive class is required.

## 3. Move Add form to a dedicated page

**Create:**

- `components/delivery/delivery-area-form.tsx`
- `app/(dashboard)/admin/delivery-areas/new/page.tsx`
- `app/(dashboard)/branch-manager/delivery-areas/new/page.tsx`

**Modify:**

- `components/delivery/delivery-areas-manager.tsx` (replace later; first remove create UI from list)
- `tests/e2e/full-page-audit/admin.spec.ts`
- `tests/e2e/full-page-audit/branch-manager-delivery.spec.ts`

**TDD steps:**

1. Add focused assertions that the list has no creation form, Add navigates to `/new`, Super Admin sees a branch selector, and Branch Manager sees read-only own-branch context.
2. Run only those assertions and confirm failure because routes/UI do not exist.
3. Build shared controlled form shell with `noValidate`, breadcrumbs, Back, Submit, Cancel, and preserved values.
4. Add authenticated role pages; load active/non-archived branches for Super Admin and the assigned branch for Branch Manager.
5. Rerun focused assertions.

## 4. Redesign list header and Add button

**Create:**

- `components/delivery/delivery-area-explorer.tsx`

**Modify:**

- `app/(dashboard)/admin/delivery-areas/page.tsx`
- `app/(dashboard)/branch-manager/delivery-areas/page.tsx`
- `components/layout/page-header.tsx` only if needed for a backward-compatible mobile action wrapper

**TDD steps:**

1. Assert role-specific title/description, plus-icon Add link, and full-width mobile action.
2. Confirm failure on current pages.
3. Render `PageHeader` plus shared explorer; keep pages as Server Components.
4. Use existing brand, surface, border, text, spacing, and dark-mode tokens.
5. Verify at desktop and 320px.

## 5. Implement server-side search

**Create:**

- `lib/delivery-areas/query.ts`

**Modify:**

- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/route.ts`
- both Delivery Areas list pages
- `components/delivery/delivery-area-explorer.tsx`

**TDD steps:**

1. Add API/UI assertions for trimmed partial search across area name, branch name, and branch address; assert a foreign branch remains invisible to Branch Manager.
2. Confirm current API returns unfiltered results.
3. Implement client-safe parsing/building with capped search length and safe defaults.
4. Build Prisma `OR` search under the mandatory role scope; select only list fields.
5. Add debounced search, clear button, native history integration, AbortController, and request sequence guard.
6. Verify Back/Forward, refresh persistence, and stale-response prevention.

## 6. Implement role-safe branch filter

**Modify:**

- `lib/delivery-areas/query.ts`
- `lib/services/delivery-areas.ts`
- `components/delivery/delivery-area-explorer.tsx`
- both list pages

**TDD steps:**

1. Assert Super Admin branch filtering and invalid branch fallback.
2. Assert Branch Manager has no editable selector and cannot expose another branch with `?branch=...` or legacy `?branch_id=...`.
3. Implement active/non-archived branch options for Super Admin.
4. Force Branch Manager scope inside the service regardless of submitted query.
5. Verify filter changes reset page to 1 and survive refresh.

## 7. Implement active-status and hold-state filters

**Modify:**

- `lib/delivery-areas/query.ts`
- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/route.ts`
- `components/delivery/delivery-area-explorer.tsx`

**TDD steps:**

1. Assert combined `status=active|inactive` and `deliveryState=available|held` results.
2. Assert legacy `status=held` still means held when `deliveryState` is absent.
3. Confirm failure on current single-status parser.
4. Add fixed enums and combined Prisma predicates.
5. Add automatic filters plus Clear All; omit default values from generated URLs.

## 8. Implement pagination and stable real summaries

**Modify:**

- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/route.ts`
- both list pages
- `components/delivery/delivery-area-explorer.tsx`

**TDD steps:**

1. Assert current-page results, total count, no duplicates, safe out-of-range handling, and preserved query state.
2. Assert real scope summary counts: total, active, held, inactive, plus branches-covered for Super Admin.
3. Implement fixed default page size 20, validated page/page-size, Prisma `skip`/`take`, count, summary `groupBy`/aggregate work, and deterministic ID tiebreaker.
4. Return `page`, `page_size`, `count`, `results`, and `summary` while retaining envelope compatibility.
5. Render “Showing X–Y of Z”, Previous, current page, numbered links, and Next.
6. If mutation leaves a non-first page empty, navigate to the previous valid page and refetch.

## 9. Improve table columns, safe sorting, and actions

**Modify:**

- `lib/delivery-areas/query.ts`
- `lib/services/delivery-areas.ts`
- `components/delivery/delivery-area-explorer.tsx`
- `components/layout/icons.tsx` only if the existing set lacks an accessible search/edit glyph

**TDD steps:**

1. Assert fixed sort allowlist and direction; malformed values cannot reach Prisma.
2. Assert Area, Branch (Super Admin), Time, Charge, Delivery State, Active Status, Updated, and Actions render.
3. Add predictable default sort plus Name, Branch (Super Admin), Time, Charge, and Updated choices with ascending/descending labels.
4. Format zero charge as translated Free and non-zero charge with the established money formatter.
5. Link Edit while preserving a validated return-to list URL; render only the valid Hold or Resume action.

## 10. Add mobile card behavior

**Modify:**

- `components/delivery/delivery-area-explorer.tsx`

**TDD steps:**

1. Add responsive assertions at 320, 360, 375, 390, 414, 768, and desktop: no document overflow, no clipped action, controls reachable, names wrap.
2. Confirm current table-only UI fails narrow-width expectations.
3. Render desktop table at the dashboard table breakpoint and equivalent touch-friendly cards below it.
4. Keep search/filter controls and Add action full width on mobile.

## 11. Improve empty, loading, and error states

**Create:**

- `components/delivery/delivery-area-list-skeleton.tsx`

**Modify:**

- `components/delivery/delivery-area-explorer.tsx`

**TDD steps:**

1. Assert distinct zero-scope and filtered-no-result states.
2. Delay/abort an API response and assert skeleton rows/cards appear without an empty-state flash.
3. Force an API failure and assert translated Error plus Retry while no fake empty data appears.
4. Implement accessible `aria-busy`, skeletons, retry, onboarding Add action, and Clear Filters no-result action.

## 12. Improve Hold/Resume confirmation flow

**Modify:**

- `components/delivery/delivery-area-explorer.tsx`
- reuse `components/ui/confirm-modal.tsx`

**TDD steps:**

1. Assert confirmation names the selected area and explains new-order effects.
2. Assert Hold submits its own optional reason, badge/action update after success, filters/page remain, and duplicate clicks are blocked.
3. Assert Resume confirmation closes cleanly and another row remains usable.
4. Wire per-row client mutation actions through existing authorized endpoints; refetch only current query.

## 13. Complete Add validation

**Modify:**

- `components/delivery/delivery-area-form.tsx`
- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/route.ts`
- `lib/validation/limits.ts` only if no suitable shared name constraint exists

**TDD steps:**

1. Assert frontend stops blank/short/long name, non-integer/out-of-range time, invalid/negative money, and missing Super Admin branch.
2. Assert API independently rejects the same values and does not convert invalid charge text to zero.
3. Assert duplicate normalized names stay branch-scoped and values remain after both client/server errors.
4. Require eligible active/non-archived branch on create; ignore Branch Manager submitted branch.
5. On success redirect to list with exact-name search (and Super Admin branch) plus success marker so the new row is visible.

## 14. Complete dedicated Edit experience

**Create:**

- `app/(dashboard)/admin/delivery-areas/[id]/edit/page.tsx`
- `app/(dashboard)/branch-manager/delivery-areas/[id]/edit/page.tsx`

**Modify:**

- `components/delivery/delivery-area-form.tsx`
- `lib/services/delivery-areas.ts`
- `app/api/delivery-areas/[id]/route.ts`

**TDD steps:**

1. Assert existing name/time/charge/active/hold context loads, branch is read-only, and values survive errors.
2. Assert PATCH supports validated `is_active`, and Branch Manager cross-branch direct routes/PATCH return forbidden/not found according to existing policy.
3. Extend `AreaInput` with active state; parse booleans strictly and update without changing branch.
4. Add role pages using `areaForManage`; render not-found/forbidden through existing app conventions.
5. Save and Cancel return to validated role list state; successful update shows feedback and keeps the area visible.

## 15. Add English/Bangla translations

**Modify:**

- `messages/en.json`
- `messages/bn.json`

**TDD steps:**

1. Extend UI assertions in both locales for new labels, states, validation, confirmation, pagination, success, error, and breadcrumbs.
2. Add identical key paths under `deliveryArea` in both dictionaries; no new hardcoded user-facing English.
3. Run JSON parse and exact recursive key-parity check.

## 16. Confirm Super Admin and Branch Manager scopes

**Modify tests:**

- `tests/e2e/25-round2-features.spec.ts`
- `tests/e2e/28-admin-catalog-governance.spec.ts`
- `tests/e2e/30-data-loading-regressions.spec.ts`
- `tests/e2e/full-page-audit/admin.spec.ts`
- `tests/e2e/full-page-audit/branch-manager-delivery.spec.ts`
- optionally create `tests/e2e/delivery-areas-management.spec.ts` for the focused redesign contract

**Verification:**

1. Run focused Delivery Areas UI/API assertions only.
2. Run existing Delivery Area ownership, duplicate, Hold/Resume, snapshot immutability, and data-loading regression assertions.
3. Run ESLint only on changed TS/TSX files where supported.
4. Run `npx tsc --noEmit`.
5. Run `npm run build` only if focused checks expose an App Router/build-only concern; no deployment.
6. Inspect 320–desktop screenshots in light/dark and EN/BN.

## 17. Update implementation audit and finish evidence review

**Modify:**

- `NEW_FEATURES_IMPLEMENTATION_AUDIT.md`

**Steps:**

1. Add a concise Delivery Areas UX/list-query record beside requirement #1; do not rewrite unrelated audit history.
2. Run `git diff --check`.
3. Inspect `git diff --stat`, `git diff --name-only`, and `git status --short`.
4. Confirm no Prisma schema/migration, sibling project, database reset, deployment, PM2/Nginx, or forbidden Git operation occurred.
5. Prepare the requested 31-point concise final report with exact commands/results and any honest limitations.

