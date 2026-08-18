# DROPDOWN ARROW AUDIT — MAD Delivery HQ

Every dropdown in the system must be visually identifiable as a dropdown.
Branch `main`. Verified against the isolated test database on a dedicated port;
the live PM2 application was not built, restarted or deployed.

---

## 1. Root cause

`SELECT_EXTRA_CLASS` in `components/ui/field-class.ts` read:

```
"appearance-none pr-9 [&>option]:bg-surface-card [&>option]:text-fg-base"
```

`appearance-none` is there for a good reason — it is what lets the option list
be forced onto the theme surface, without which native `<option>` lists were
unreadable in dark mode. But it also strips the browser's own arrow, and
**nothing drew one back**. `pr-9` reserved space for an arrow that was never
rendered.

Result: every `<select>` in the application rendered as a plain text input.
This was one constant, not sixty separate bugs.

## 2. Fix — one shared implementation

`app/globals.css` gains `.field-select-arrow`; `SELECT_EXTRA_CLASS` now carries
it. Nothing else changed.

A **background image**, not a wrapper element, because many selects are rendered
by Server Components as a bare `<select>` with no parent to hang a decorative
icon on. A background is inert by definition — no pointer target, nothing
focusable, invisible to assistive technology — so it needs no
`pointer-events: none` and no `aria-hidden`, and it cannot intercept the click
that opens the native list.

- One chevron, 16×16, inset `0.75rem` from the right edge, vertically centred.
- Inline `data:` URI — **no network request**.
- `appearance-none` stays, so there is exactly **one** arrow, never two.
- Theme-aware: a data URI cannot inherit `currentColor`, so each theme gets its
  own copy in a token colour — slate-500 on light, slate-400 on dark.
- Disabled: `opacity: 0.55` — muted, still unmistakably a dropdown.
- `pr-9` (2.25rem) already exceeds the glyph plus its inset, so a long selected
  value truncates before it can reach the arrow.
- `[dir="rtl"]` flips the arrow and the padding. Bangla is left-to-right, so
  this is a safety net for a future RTL locale rather than a path in use.

## 3. Coverage

| Implementation | File | Routes | Kind | Before | After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Shared `SELECT_EXTRA_CLASS` | `components/ui/field-class.ts` | every route with a select | native `<select>` | no arrow | themed chevron | **FIXED_SHARED_COMPONENT** |
| Shared `<Select>` | `components/ui/input.tsx` | 27 components, 60 select instances (see below) | native | no arrow | inherits the shared class | **FIXED_SHARED_COMPONENT** |
| `ListFilterSelect` | `components/dashboard/list-controls.tsx` | `/admin/customers`, `/admin/staff`, `/admin/orders`, `/admin/branches`, `/admin/activity-logs`, `/admin/branch-manager-history`, `/admin/products/deactivated` | native | no arrow | inherits | **FIXED_SHARED_COMPONENT** |
| `InstantFilterSelect` | `components/dashboard/instant-list-controls.tsx` | `/admin/products` | native | no arrow | inherits | **FIXED_SHARED_COMPONENT** |
| Accounts transactions filters | `app/(dashboard)/accounts/transactions/page.tsx` | `/accounts/transactions` | native, composes `FIELD_CLASS + SELECT_EXTRA_CLASS` directly | no arrow | inherits | **FIXED_SHARED_COMPONENT** |

The 27 components rendering `<Select>` (60 instances) span every role:
accounts (financial forms, ramadan transactions) · admin (category form, reward
rules) · branch manager (attendance, employees, ramadan, reservations, table
layout) · branches (assign manager, branch form) · catalog (product form) ·
complaints · customer (ramadan booking) · users (user form, users explorer) ·
delivery (area explorer, area form, areas manager) · profile · marketing forms ·
notices · orders (assign rider, **checkout**) · rider (online panel) · riders
(assign branch).

No `appearance-none` or `appearance: none` exists anywhere outside
`field-class.ts` — verified by repository search — so there is no page-level
select that bypasses the shared style. No local exceptions were needed:
**FIXED_LOCAL_EXCEPTION count is zero.**

## 4. Custom (non-`<select>`) dropdown triggers

| Control | File | Decision | Status |
| --- | --- | --- | --- |
| Dashboard profile menu | `components/layout/topbar.tsx` | already renders a chevron beside the avatar | **ALREADY_CORRECT** |
| Storefront profile menu | `components/home/Header.tsx` | already renders a chevron beside the avatar | **ALREADY_CORRECT** |
| Product row actions | `components/catalog/product-row-actions.tsx` | three-dot action menu — the brief excludes these | **NOT_APPLICABLE** |
| Table actions menu | `components/dashboard/table-actions-menu.tsx` | three-dot action menu | **NOT_APPLICABLE** |
| Language switcher | `components/language/language-switcher.tsx` | segmented toggle: both options are always visible with `aria-pressed`. It is a tab-like group, not a dropdown, and the brief excludes tabs and buttons | **NOT_APPLICABLE** |
| Theme switcher | `components/layout/theme-switcher.tsx` | a genuine selector, but its trigger is a fixed 44 px circular icon-only button. Fitting a chevron beside the sun/moon would require resizing it — a design change the brief rules out. Left unchanged and recorded rather than quietly altered | **NOT_APPLICABLE** (see §7) |

## 5. Test evidence

`tests/e2e/58-dropdown-arrows.spec.ts` — **13 tests, 13 passed.** Assertions are
on the RENDERED result, never on a class name: for every visible `<select>` the
computed `background-image` must contain an SVG, `appearance` must still be
`none` (which rules out both "no arrow" and "our arrow plus the native one"),
`padding-right` must be ≥ 28 px, and the control must not be collapsed.

Covered: super_admin (`/admin/products`, `/admin/products/create`,
`/admin/products/deactivated`, `/admin/orders`, `/admin/customers`,
`/admin/staff`, `/admin/branches`, `/admin/categories/new`) · branch_manager
(product create, employees) · accounts (transactions) · management (orders) ·
marketing (campaigns) · both themes with **different ink** (a single fixed colour
would vanish on one surface) · disabled · `aria-invalid` · 320/360/375/414/768 px
with no clipping and no horizontal overflow · Bangla · the filter still applies
automatically after the change · focus lands on the select itself (proving the
background cannot intercept events) · a form select still holds its value · and
**plain text inputs did not gain a chevron**.

Regression: `57-admin-products-filtering` re-run green, so automatic filtering,
URL state and pagination are untouched.

## 6. Unchanged

No option values, labels, saved values, validation rules, filter logic,
pagination, permissions, API contracts or layouts were touched. `tsc`, `eslint`
and the production build are clean. **No schema or migration changes.**

## 7. Limitations

1. **Theme switcher has no chevron** (see §4). It is a 44 px icon-only button;
   adding one means resizing the control, which the brief forbids.
2. **Browser coverage is Chromium only** — that is the project's Playwright
   environment. The implementation uses a plain CSS background image with no
   vendor prefixes or browser hacks, so it does not depend on Chromium
   behaviour, but Firefox and Safari were not exercised here.
3. **RTL is untested end to end.** The `[dir="rtl"]` rule is written and the app
   never sets `dir="rtl"` today (Bangla is LTR), so no test asserts it.
