# Delivery Areas Management Redesign

**Date:** 2026-07-30  
**Project:** `/Users/whiteking/Desktop/Desktop/WebDevelopment/mad-delivery-hq`  
**Status:** Approved

## 1. Purpose

Redesign Delivery Areas as a focused management module. The list page will contain only summaries, search, filters, paginated results, and row actions. Creation and editing will use dedicated routes and a shared form. Existing ownership, duplicate-name, delivery-time, delivery-charge, hold/resume, checkout, and immutable-order-snapshot rules remain authoritative.

## 2. Existing Architecture

- Super Admin list: `/admin/delivery-areas`
- Branch Manager list: `/branch-manager/delivery-areas`
- Both pages render `DeliveryAreasManager`.
- `DeliveryAreasManager` currently owns the add form, client-only branch filter, unlimited table, inline editing, and Hold/Resume.
- `/api/delivery-areas` uses `areasForUser`, `createArea`, and `serializeArea`.
- `/api/delivery-areas/[id]`, `/hold`, and `/resume` use the same role-aware service.
- `BranchDeliveryArea` is the sole delivery-area model. It already stores active state, hold state/reason, delivery time, charge, timestamps, optional coordinates, and the last updating user.
- Branch Manager ownership is already enforced by `branchForManager` and `areaForManage`.

## 3. Scope

### In scope

- Dedicated list-management pages for Super Admin and Branch Manager
- Dedicated Add pages
- Dedicated Edit pages
- Shared query, list, form, action, validation, and presentation components
- Server-side search, filtering, pagination, summaries, and safe sorting
- URL-based list state
- Responsive desktop table and mobile card list
- Hold/Resume confirmation
- English/Bangla translation parity
- Focused Delivery Areas tests and implementation-audit record

### Out of scope

- New database models or migrations
- Delete/archive behavior, because current Delivery Area business rules do not support it
- A separate detail page
- Maps on the list page
- Changing branch ownership
- Changing checkout, coverage, nearest-branch, radius, payment, product, or order behavior
- Application-wide redesign or audit

## 4. Routes

| Role | List | Add | Edit |
| --- | --- | --- | --- |
| Super Admin | `/admin/delivery-areas` | `/admin/delivery-areas/new` | `/admin/delivery-areas/[id]/edit` |
| Branch Manager | `/branch-manager/delivery-areas` | `/branch-manager/delivery-areas/new` | `/branch-manager/delivery-areas/[id]/edit` |

No `/[id]` view route will be added. Two actions—Edit and Hold/Resume—do not justify another page or drawer.

## 5. Shared Architecture

### Service query

`lib/services/delivery-areas.ts` will expose a typed, validated list query:

```ts
type DeliveryAreaActiveStatus = "active" | "inactive";
type DeliveryAreaDeliveryState = "available" | "held";
type DeliveryAreaSort = "name" | "branch" | "minutes" | "charge" | "updated";
type SortDirection = "asc" | "desc";

interface DeliveryAreaListQuery {
  search?: string;
  branchId?: number;
  activeStatus?: DeliveryAreaActiveStatus;
  deliveryState?: DeliveryAreaDeliveryState;
  page: number;
  pageSize: number;
  sort: DeliveryAreaSort;
  direction: SortDirection;
}
```

The service will:

- Trim search text and cap its safe length.
- Search area name, branch name, and branch address.
- Force Branch Manager queries to the authenticated manager’s assigned branch.
- Allow Super Admin’s optional branch filter only after numeric validation.
- Apply active and hold-state filters together.
- Use a fixed sort allowlist; raw query values never reach Prisma ordering.
- Return `count`, `results`, `page`, `pageSize`, and scope-level summary counts.
- Fetch only fields needed by the list.
- Run count, rows, and summary queries without N+1 reads.

### Summary semantics

Summaries describe the user’s full permitted scope, not the current filtered subset:

- Total Areas
- Active Areas
- On Hold
- Inactive Areas
- Branches Covered—Super Admin only

This keeps metrics stable while operators narrow the table.

“Active” means `isActive=true`, regardless of hold state. “On Hold” is a separate operational subset, so it may overlap Active; Active plus Inactive still equals Total.

### API

`GET /api/delivery-areas` will accept:

```text
search
branch
status
deliveryState
page
page_size
sort
direction
```

Defaults are omitted from generated URLs. Invalid enum, page, sort, direction, and branch values fall back to safe defaults or no optional filter. Branch Manager scope is still forced in the service.

Existing API compatibility is preserved: `status=held` remains accepted as a legacy alias for `deliveryState=held` when the new parameter is absent. New list URLs use `status=active|inactive` and `deliveryState=available|held`.

The API response remains compatible with the existing pagination envelope and adds non-sensitive list metadata:

```ts
{
  count: number;
  next: null;
  previous: null;
  results: DeliveryAreaRow[];
  page: number;
  page_size: number;
  summary: DeliveryAreaSummary;
}
```

POST, PATCH, Hold, and Resume endpoints keep using existing service functions.

## 6. List Page

### Header

`PageHeader` will receive:

- Existing translated title and role-specific description
- Prominent Add Delivery Area `ButtonLink`
- Existing `plus` icon

Desktop places the action right of the heading. Mobile stacks it below the description at full width.

### Visual structure

```text
┌ Delivery Areas ─────────────────────────── [+ Add Delivery Area] ┐
│ Description                                                     │
└─────────────────────────────────────────────────────────────────┘

┌ Total ┐ ┌ Active ┐ ┌ On Hold ┐ ┌ Inactive ┐ ┌ Branches ┐

┌ Search areas… ──────┐ [Branch] [Status] [Delivery state] [Sort]
                                              [Clear filters]

┌ Area / branch │ Time │ Charge │ Delivery │ Active │ Updated │ Actions ┐
│ ...server-paginated rows...                                      │
└ Showing 1–20 of 76                         Previous  1  2  Next ┘
```

The design stays inside existing MAD dashboard tokens: brand red for primary action, compact neutral cards, tabular figures for time/charge, and existing semantic badge tones. No page-specific palette or typography is introduced.

### URL state

The URL is the source of truth:

```text
?search=banani&branch=3&status=active&deliveryState=held&page=2&sort=updated&direction=desc
```

- Search commits after a short debounce and uses history replacement.
- Filter, sort, and pagination changes use history pushes.
- Any search/filter/sort change resets to page 1.
- Back/Forward, refresh, and shared links restore state.
- Clear Filters navigates to the clean role-specific list path.
- Pagination preserves every active query value.
- An AbortController and request sequence prevent stale results.

### Search and filters

- Search control includes search icon, clear button, accessible label, and loading indicator.
- Super Admin sees active, non-archived branch options plus All Branches.
- Branch Manager sees a read-only assigned-branch context, never a branch selector.
- Both roles see All/Active/Inactive and All/Available/On Hold filters.
- Sort choices are Area name, Branch (Super Admin), Delivery time, Delivery charge, and Updated.
- Filters use automatic application, matching the existing UsersExplorer architecture; no redundant Apply button.

### Results

Desktop columns:

1. Area name, with branch address as optional secondary context for Super Admin
2. Branch—Super Admin only
3. Delivery time
4. Delivery charge
5. Delivery state
6. Active status
7. Updated
8. Actions

Zero charge displays the translated “Free”; other charges use the established money formatter. Status badges always contain readable text and a leading status dot.

### Actions

Each row has two consistently aligned actions:

- Edit—link to the role-specific dedicated edit route
- Hold or Resume—state-dependent confirmation

Hold confirmation:

- Names the selected area.
- Explains only new orders are blocked.
- Keeps the existing optional hold-reason rule.
- Prevents duplicate submissions.

Resume confirmation:

- Names the selected area.
- Explains new eligible orders will be accepted again.

After success, the current query is re-fetched. URL, page, search, filters, and sort remain unchanged. If the last result disappears from a page, the explorer moves to the previous valid page.

## 7. Responsive Behavior

At desktop/tablet widths, results use the existing table surface.

Below the dashboard mobile breakpoint, results become cards containing:

- Area name
- Branch, when Super Admin
- Delivery time
- Charge
- Delivery-state and active-state badges
- Updated date
- Edit and Hold/Resume controls

Search and each filter become full width. Add button is full width. Long names wrap with `min-w-0` and break-safe text. No horizontal document overflow is permitted at 320, 360, 375, 390, 414, or 768 pixels.

## 8. Empty, Loading, and Error States

- No scoped Delivery Areas: onboarding empty state with Add Delivery Area action.
- No filtered results: “No delivery areas match your search or filters” plus Clear Filters.
- Loading: existing results remain visible at reduced opacity with an accessible busy/loading indicator; no empty-state flash.
- Error: translated inline error with Retry; current results are not replaced by fake empty data.

## 9. Add and Edit Forms

One shared `DeliveryAreaForm` handles create and edit.

### Add page

- Breadcrumb-style back link
- Page title and description
- Role-aware branch context
- Form card
- Save and Cancel actions

Super Admin selects an active, non-archived branch. Branch Manager receives their assigned branch server-side and sees it as read-only context. No Branch Manager branch ID is trusted from form data.

### Edit page

- Loads through `areaForManage`
- Rejects malformed/nonexistent IDs
- Rejects cross-branch Branch Manager access
- Shows branch as immutable context
- Loads name, delivery time, charge, and active status
- Shows current Available/On Hold state
- Uses Save Changes and Cancel

Branch assignment cannot change.

### Validation

Frontend JavaScript validation runs through the existing `useFormValidation` contract with `noValidate`. Backend validation remains authoritative in `lib/services/delivery-areas.ts`.

Rules:

- Branch required for Super Admin; must exist, be active, and not archived for creation.
- Name trimmed; required; bounded by shared safe text limits; normalized duplicate prevented per branch.
- Delivery time required; integer; within existing `LIMITS.minutesMin` and `LIMITS.minutesMax`.
- Delivery charge required; decimal-safe; non-negative; invalid text is never converted to zero.
- Active status accepts only explicit boolean values on edit.

Every field error renders directly below its field. Form values remain after frontend or backend failures. Successful creation redirects to the role-specific list with a success query marker and useful Super Admin branch filter. Successful edit returns to the preserved list URL when supplied through a validated return parameter; otherwise it returns to the clean list.

## 10. RBAC

### Super Admin

- Lists all permitted Delivery Areas.
- Filters by eligible branch.
- Creates for any active, non-archived branch.
- Edits, holds, and resumes any existing area.

### Branch Manager

- List query always uses assigned branch.
- Add form never exposes an editable branch ID.
- Create service ignores any submitted branch ID and resolves assignment.
- Edit loader and mutations use `areaForManage`.
- Hold/Resume use `areaForManage`.
- Query parameters cannot expose another branch.
- Direct access to another branch’s edit URL returns the existing forbidden/not-found behavior without leaking row data.

Enforcement remains in server pages, service selectors, API routes, and mutation actions—not only UI controls.

## 11. Internationalization

All new user-facing copy will be added under `deliveryArea` in both `messages/en.json` and `messages/bn.json`. Keys cover:

- Header actions and descriptions
- Summary labels
- Search, filters, sort, clear, and retry
- Available, On Hold, Active, Inactive, and Free
- Result range and pagination labels
- Empty/no-match states
- Add/Edit page headings and navigation
- Field help and validation messages
- Hold/Resume confirmation text and success messages
- Updated date

EN/BN key parity will be tested. No new visible English copy will be hardcoded.

## 12. Performance

- Page size defaults to 20.
- Search, filtering, sort, and pagination run in Prisma.
- The browser never receives the unlimited area list.
- Branch options are fetched once per server page render and limited to needed fields.
- No maps, polling, or duplicate page/API fetches are added.
- Row mutations re-fetch only the active list query.
- Existing order snapshots and checkout reads are untouched.

## 13. Testing

Focused tests will cover:

- Main page has no inline Add form.
- Add button navigates to dedicated Add page.
- Search by area, branch, and branch address.
- Super Admin branch/status/delivery-state filters in combination.
- Branch Manager branch query spoofing cannot expand scope.
- Pagination preserves query state and has no duplicate rows.
- Sort allowlist and invalid-query fallback.
- Add frontend/backend field errors and value preservation.
- Normalized duplicate rejection.
- Dedicated Edit route and cross-branch denial.
- Hold/Resume confirmations name the selected area and keep current URL state.
- Desktop table and mobile cards.
- No overflow at required widths.
- Empty, no-match, loading, and error states.
- Light/dark and EN/BN parity.
- Existing order snapshot and held-area behavior remains unchanged through existing focused business tests.

## 14. Files and Boundaries

Expected new files stay inside Delivery Areas routes/components/tests:

- Shared query/parser and explorer components
- Shared form and row-action components
- Super Admin and Branch Manager Add/Edit pages
- Focused Delivery Areas E2E tests

Expected modified files:

- Existing Delivery Areas list pages
- `lib/services/delivery-areas.ts`
- Delivery Areas API list route
- Delivery Areas translation sections
- Delivery Areas implementation audit

No sibling project, infrastructure, deployment, PM2, Nginx, database-reset, seed, migration, or Git integration operation is part of this work.
