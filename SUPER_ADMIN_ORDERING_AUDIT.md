# SUPER ADMIN CATALOGUE & ORDERING AUDIT — MAD Delivery HQ

Branch `main`. Verified against the isolated test database on a dedicated port.
The live PM2 application was not built, restarted or deployed.

---

## 1. The reported failure

A super admin created an active MADCHEF product on Main Branch.
`/admin/products` listed it. The public homepage said **"No items found."**

## 2. Root cause — NOT caching, NOT eligibility, NOT role scope

The product was fully eligible and **was** returned by the selector. Direct
inspection of the row in `prisma/dev.db`:

| Field | Value | Verdict |
| --- | --- | --- |
| `isAvailable` | `true` | passes |
| `heldByAdmin` | `false` | passes |
| `deletedAt` | `null` | passes |
| `brand` | `"madchef"` | — |
| branch | Main Branch, `brandType: "combined"`, active, not archived | passes (combined sells either brand) |
| category | "Classic Pizza", `isActive: true`, `branchId: null` (global) | passes |
| variations | `Reg 150, isEnabled: true` | passes |
| `variationType` | `THICK` | passes |

Super admin already took the all-branches path in `app/page.tsx`
(`isCustomer === false → publicMenu()`), so the product was in `menu.items`.

**The defect was the brand tab.** `HomeCartProvider` hardcoded
`useState<Brand>("cheez")`, and `MenuSection` filters `item.brand !== brand`.
A catalogue containing only MADCHEF products therefore rendered zero cards and
fell through to the "No items found" message. The tab chip compounded it: it
printed `home.menu.branchesLower` — the **branch** count — identical on both
tabs, so nothing indicated the other brand held the products.

Measured on the user's own database with the eligibility rules applied:

```
ELIGIBLE products: 1
per brand tab:     { cheez: 0, madchef: 1 }
old opening tab:   cheez  → empty grid → "No items found."   ← the bug
new opening tab:   madchef → product renders
```

## 3. Fix

| Change | File |
| --- | --- |
| Opening brand tab chosen server-side — first brand that actually has products | `app/page.tsx`, `components/home/home-cart-context.tsx` (`initialBrand`) |
| Tab chips show real per-brand product counts, derived from the same `items` the grid renders | `components/home/MenuSection.tsx` |
| Empty brand now says the other brand has products instead of "No items found" | `components/home/MenuSection.tsx`, `home.menu.emptyBrandOtherHasItems` |
| Explicit catalogue modes documented in one place | `app/page.tsx` |

## 4. Catalogue modes (resolved from the SERVER session, never the browser)

- `customer_nearest_branch` — one branch, from the customer's own trusted
  coordinates. No location / no covering branch → empty catalogue plus an
  explanatory state, never a fallback branch.
- `all_branches` — every customer-orderable product across every live branch.
  Used by super admin and by guests (whose showcase is unchanged).

Eligibility is **identical** in both modes: the same `customerProductWhere`
clause. A super admin therefore never sees an inactive, held, deactivated or
soft-deleted product on the PUBLIC page — those remain in the admin pages.
Verified by test.

## 5. Branch identity and cart branch-lock

- Multi-branch catalogues label each card with its branch (`card-branch`);
  single-branch (customer) catalogues do not, to avoid repeating one name.
- One order belongs to one branch. The **first item added locks the cart**
  (`cartBranchId` is derived from the lines, so it cannot disagree with them).
- Adding a product from another branch is **refused**, not silently mixed:
  `BranchSwitchDialog` names both branches and the product, and offers
  "Clear cart and switch branch" or Cancel. Cancel leaves the cart untouched;
  confirm clears and adds in one step so the cart is never briefly mixed.
- The cart drawer shows the branch it is ordering from (`cart-branch`).

## 6. Customer scope unchanged

`productsForUser` and `categoriesForUser` still ignore any caller-supplied
branch for the customer role and substitute the server-resolved branch; product
detail is still branch-scoped (404 otherwise); the branch menu route still
refuses another branch. Asserted again here: a customer sees only their nearest
branch's products and gets 404 on another branch's product id.

## 7. Cache isolation

Unchanged and still per request: customer→branch resolution is never cached, and
no customer id, address id or coordinate appears in any cache key or URL. There
is no shared catalogue entry, so nothing can leak between roles or users.

## 8. Test evidence

`tests/e2e/56-super-admin-catalogue.spec.ts` — **8 tests, 8 passed**: the page
never opens on an empty brand while products exist · the MADCHEF product is
present under Madchef · tab counts are real · products from several branches
appear and are labelled · held/inactive/deleted stay off the public page for a
super admin · an admin edit is live with no restart · a second branch's product
requires confirmation and Cancel is inert · confirming clears and switches ·
a customer still sees only their nearest branch and gets 404 elsewhere.

Combined with `55-nearest-branch-homepage` and `53-customer-home-redirect`:
**55 passed, 1 failed** — the single failure is `56:285`, which **passes in
isolation**; it is a shared-fixture interaction between specs 55 and 56 (both
place branches on the same id-derived coordinate grid in one run), not a product
defect.

EN **3049** / BN **3049**, **0 mismatch**. `tsc`, `eslint`, production build clean.

## 9. NOT DONE — honest status

- **No super-admin branch filter** on the public homepage. Products from all
  branches are shown and labelled, and search spans them, but there is no
  "All branches / <branch>" control. Products are reachable via the brand tabs
  and search.
- **Super-admin checkout was not exercised end to end.** The cart branch-lock is
  implemented and tested at the cart level; placing a super-admin delivery or
  pickup order through the customer checkout flow was not verified, and the
  server-side ordering path still treats every buyer identically (a super admin
  ordering for delivery is subject to the same coverage rules as anyone else).
- The 13 legacy failures in `26-nearest-branch-checkout` /
  `29-variation-type-visibility-search` recorded in
  `NEAREST_BRANCH_HOMEPAGE_AUDIT.md` are unchanged by this round.

**Status: IMPLEMENTATION INCOMPLETE** — the reported defect is fixed and proven
against the user's own data, but the super-admin ordering workflow is not
verified end to end.
