# PRODUCT SYSTEM SYNC AUDIT — MAD Delivery HQ

Scope: make the database-backed admin product system the single source of truth for
every customer-visible product. Branch `main`. Verified against the isolated test
database on a dedicated port; the live PM2 build was never rebuilt or restarted.

---

## 1. Root cause

**The homepage never queried the database for products.**

`components/home/MenuSection.tsx` imported `MENU_ITEMS` from `lib/home/menu-data.ts`
— 326 lines defining **107 products** (names, prices, images, sizes, add-ons,
categories) in source. `components/home/NavSearch.tsx` imported `SEARCH_INDEX`,
derived from the same array.

Measured overlap with the real catalogue: **zero**.

| Source | Count | Example names |
| --- | --- | --- |
| `lib/home/menu-data.ts` (hardcoded) | 107 | Margherita, The Pepperonia, Nagatastic BBQ, Shah Poutine, Liquid Gold |
| `prisma/dev.db` `Product` | 41 | Classic Burger, Cheese Pizza, Cold Drink, Pepperoni Pizza, Beef Khichuri |

Not one homepage product existed as a database row, so **no** edit, price change,
deactivation, hold or delete in the admin panel could ever affect the storefront.
This was **not** a caching problem — there was nothing to invalidate. The file's own
header admitted it: *"This is static showcase data … To switch this page to live data
later, replace `MENU_ITEMS` with a fetch."*

A second, smaller defect was found while verifying: order history rendered item names
through the **live** `product` relation, so renaming a product retroactively rewrote
every past order. See §9.

---

## 2. Runtime product sources found

| # | Source | Kind | Disposition |
| --- | --- | --- | --- |
| 1 | `lib/home/menu-data.ts` — `MENU_ITEMS`, `CATEGORIES`, `SEARCH_INDEX` | Hardcoded catalogue (107 products, 16 categories) | **Deleted** |
| 2 | `lib/home/types.ts` — `CategoryKey` closed union of 15 hardcoded keys | Hardcoded category identity | **Replaced** with `string` (DB category id) |
| 3 | `ProductCard.tsx` `CATEGORY_FALLBACK` emoji map keyed by hardcoded categories | Presentation, but keyed to dead identities | **Replaced** with `categoryEmoji(name)` |
| 4 | `ItemModal.tsx` `CATEGORY_EMOJI` + `CLASS_TONE` keyed to hardcoded groups | Same | **Replaced** — tones now key off DB flags |
| 5 | `lib/selectors/index.ts` `productsForUser` (customer branch) | DB, eligibility definition **A** | **Unified** onto shared selector |
| 6 | `lib/services/orders.ts` `orderableProductWhere` | DB, eligibility definition **B** | **Unified** |
| 7 | `lib/services/orders.ts` `resolveDeliveryBranch` inline filter | DB, eligibility definition **C** (partial) | **Unified** |
| 8 | `app/(dashboard)/admin/products/page.tsx` `take: 300` | DB, admin | **Rebuilt** with server pagination |

Definitions A, B and C disagreed. A required an enabled variation and a live branch;
B did not, but required branch-scoped category validity; C checked only three flags.
A product could therefore be listed but unorderable, or orderable but unlisted.

Searched and confirmed absent: JSON product files, localStorage catalogues,
build-time snapshots, seed data imported by runtime UI, fallback/demo products.
Test fixtures under `tests/` were left intact and are not imported by any runtime page.

---

## 3. Authoritative product selector

**`lib/services/product-eligibility.ts`** — the one definition of
"a customer may see and order this product".

`customerProductWhere({ branchId?, brand?, categoryId?, search?, ids? })` composes:

| Rule | Clause |
| --- | --- |
| Not soft-deleted | `deletedAt: null` |
| Sellable | `isAvailable: true, heldByAdmin: false` |
| Live branch | `branch: { isActive: true, isArchived: false }` |
| Purchasable | `variations: { some: { isEnabled: true } }` |
| Valid crust policy | `variationType in (THICK, THIN, BOTH)` |
| Brand compatible | branch `combined`, or product brand === branch `brandType`, or brand null |
| Category active + in scope | no category, or active **and** global/own-branch |

Two rules cannot be expressed in a Prisma `where` (Prisma cannot compare two
columns), and are handled explicitly rather than dropped:

- **Brand** is enumerated over the closed two-value `PRODUCT_BRANDS` set — exact, not
  approximate.
- **Branch-scoped category** is exact when a `branchId` is supplied. Unscoped, the
  clause additionally admits a category belonging to some other live branch; that
  residue is closed on both sides — `assertCategoryUsableInBranch` makes such a row
  impossible to write, and `productCategoryScopeOk()` re-checks it on the loaded row.

`isProductOrderable(product)` is the object-level twin, applied where a row arrives
by id rather than by listing (product detail, cart, order creation), so a direct URL
or forged API body is judged by exactly the listing rules.

### Consumers

| Surface | Source |
| --- | --- |
| Homepage sections + cards | `publicMenu()` → `customerProductWhere()` |
| Nav search index | `publicMenu().search` (same query) |
| Customer menu / catalogue | `productsForUser()` → `customerProductWhere()` |
| Product detail (`GET /api/products/[id]`) | `customerProductWhere({ids})` + `isProductOrderable` |
| Delivery-branch resolution | `customerProductWhere({ids})` |
| Quote / checkout / order creation | `orderableProductWhere` → `customerProductWhere({branchId, ids})` |
| Admin product list | Admin scope (`deletedAt: null`) — deliberately wider |
| Branch Manager catalogue | Own branch, via `productsForUser` |

---

## 4. Homepage conversion

`lib/services/public-catalog.ts` builds the storefront menu from the database and maps
each row onto the **existing** `MenuItem` shape, so the cards, modals, grid and
styling are untouched.

| Rendered field | Database column |
| --- | --- |
| Name / description | `name`, `description` |
| Price ("from ৳X") | min enabled `ProductVariation.price`, discounted by `Product.discount` |
| Sizes modal | enabled variations (offered only when >1) |
| Image | `image` via `mediaUrl(key, updatedAt)` |
| Section heading + tab | `Category.name` (rendered as-is, never through `t()`) |
| Badge | `isPopular` → `home.product.badge.popular`; `isRecommended` → `…recommended` |
| Brand tab | `Product.brand`, falling back to the branch's sole brand |
| Prep time / crust policy | `preparationTime`, `variationType` |

Design preserved: hero, card markup, grid, brand tabs, crust guide, header, footer,
branches and hours sections are byte-for-byte unchanged apart from the data source.
Category tabs only appear for categories that actually have eligible products, so no
empty section is ever rendered. No eligible products → the existing empty state.

**Visual smoke check:** `GET /` returned 200 and contained `Classic Burger`,
`Cheese Pizza`, `Cold Drink`, `Pepperoni Pizza`, `Beef Khichuri` (all real rows) and
none of `Margherita`, `The Pepperonia`, `Nagatastic BBQ`, `Shah Poutine`.

---

## 5. Homepage visibility / featured / ordering controls

**No new schema fields were added.** The existing columns already provide the
required control, and the task's own rule is not to add redundant fields:

| Requirement | Existing mechanism | Managed from |
| --- | --- | --- |
| Homepage visibility | `isAvailable` + `heldByAdmin` + `deletedAt` + branch/category eligibility | Product form, action menu, hold/resume |
| Featured | `isPopular` | Product Create/Edit checkbox |
| Recommended | `isRecommended` | Product Create/Edit checkbox |
| Section membership | `categoryId` | Product Create/Edit select |
| Display order | `isPopular desc, isRecommended desc, name asc`; sizes by `ProductVariation.sortOrder` | Flags + variation order |

Backfill was unnecessary — every existing product keeps its current visibility.

---

## 6. Cache architecture and invalidation

**Found:** no ISR, no `fetch` caching, no `unstable_cache`, no React Query/SWR. Every
catalogue page is dynamic (`ƒ`) and re-queries per request. The only cache in play is
Next's **client Router Cache**, which serves a previously visited route's payload on
soft navigation. Product mutations previously revalidated only `/admin/products` and
`/branch-manager/catalog` — never `/`.

**Implemented:** `lib/cache/catalog.ts` → `revalidateCatalog({ productId?, branchId? })`,
one list of every surface that renders product data:

`/`, `/customer/branches`, `/customer/branches/[id]/menu`, `/customer/cart`,
`/customer/checkout`, `/admin/products`, `/admin/products/deactivated`,
`/admin/products/[id]`, `/admin/products/[id]/edit`, `/admin/categories`,
`/admin/dashboard`, `/branch-manager/catalog`, `/branch-manager/catalog/products/[id]`,
`/branch-manager/dashboard`, `/marketing/products`, `/management/reports/products`.

Called from: `createProduct`, `updateProduct`, `softDeleteProduct`,
`setVariationEnabled`, `deleteVariation`, `setVariationDefault`, `createCategory`,
`updateCategory`, `setCategoryActive`, `deleteCategory`, product `hold`/`unhold`
(across every branch the cross-branch hold touches), `toggle-availability`, branch
`activate`/`deactivate`/`archive`/delete, and branch `PATCH` when `brand_type` or
`is_active` changes.

No blanket `revalidatePath("/", "layout")`, no global `no-store`, no timeouts, no
manual refresh button.

**Images:** uploads are re-encoded to WebP and stored under an immutable UUID
(`products/<uuid>.webp`), so a replacement always has a new URL. Product image URLs
additionally carry `?v=<updatedAt>` via `mediaUrl(key, version)`, covering legacy
rooted paths that were overwritten in place. The previous image is only replaced after
the new upload succeeds, and a validation failure elsewhere never erases it.

---

## 7. Product status behaviour

| State | Storefront / menu / search | Orderable | Admin |
| --- | --- | --- | --- |
| Active + eligible | visible | yes | All Products |
| Inactive (`isAvailable=false`) | hidden | no | Deactivated list (reason shown) |
| Admin hold (`heldByAdmin`) | hidden | no — existing orders unaffected | Deactivated list, `?state=held` |
| Soft-deleted (`deletedAt`) | hidden, direct URL 404 | no | Deactivated list, `?state=deleted`, labelled **Deleted** |

Direct product URLs and API reads enforce the same rules as the listings.

---

## 8. Delete and historical data

`softDeleteProduct` sets `deletedAt`, `deletedById` and `isAvailable=false`. It never
cascades to orders, order items, reviews, payments, reservations or reports. The
confirmation modal now says explicitly that it is a **soft** delete, that history keeps
its snapshot, and that the product remains visible to administrators under Deactivated.

---

## 9. Historical snapshot protection (defect found and fixed)

`OrderItem` snapshotted `unitPrice`, `variationName` and `variationType` — but the
serializer read `product_name` and `product_image` from the **live** product relation.
Renaming a product therefore rewrote every historical order that contained it.

**Schema change (the only one in this task):**

```
OrderItem.productName   String  @default("")
OrderItem.productImage  String?
```

Migration `20260803131915_order_item_product_snapshot`. Prisma's generated version
rebuilt the whole table (create / copy / **DROP** / rename); it was replaced by two
plain `ALTER TABLE ADD COLUMN` statements plus a backfill, so the live table is never
dropped and no row is ever copied between tables.

Safety procedure followed:

- Timestamped backup: `backups/dev.db.2026-08-03T13-19-05-104Z.bak`
- Row counts **before**: users 12, branches 22, categories 43, products 41,
  variations 57, orders 126, orderItems 128, reviews 1
- Row counts **after**: **identical on all eight tables**
- Backfill: 128/128 order lines populated; 0 rows left without a snapshot name

`createOrder` now writes both columns at order time. The serializer prefers the
snapshot and falls back to the relation only for pre-migration rows (none remain).

---

## 10. Admin product control

`/admin/products` rebuilt: server-side search (name, description, brand, branch name,
category name), filters (branch, brand, category, status, variation type), whitelisted
sorting, **10 rows per page** server-side, active-filter chips, Clear All, results
count, responsive mobile cards, and a compact action menu. Summary cards count the
full authorized dataset via `getAdminProductSummary()` and link to their filter.

`/admin/products/deactivated` rebuilt the same way, with a deactivated/held/deleted
filter so a soft-deleted product stays findable.

`DEFAULT_PAGE_SIZE` is now **10** (`lib/http/list-params.ts`), shared by every
server-paginated list.

### Dedicated pages

| Page | Route | Status |
| --- | --- | --- |
| List | `/admin/products` | rebuilt |
| Create | `/admin/products/create` | existing |
| **View** | `/admin/products/[id]` | **new** |
| Edit | `/admin/products/[id]/edit` | existing |
| BM list | `/branch-manager/catalog` | action menu swapped in |
| BM Create | `/branch-manager/catalog/products/create` | existing |
| **BM View** | `/branch-manager/catalog/products/[id]` | **new** |
| BM Edit | `/branch-manager/catalog/products/[id]/edit` | existing |

The View page reports the product's real customer visibility using the shared
`isProductOrderable` predicate — a second opinion is not computed.

### Confirmation modals

`components/catalog/product-row-actions.tsx` — View / Edit / Activate-Deactivate /
Hold-Resume / Delete. Every destructive action opens a `ConfirmModal` naming the
product; deactivation requires a reason. No browser `confirm()`, no inline forms, no
unconfirmed destructive links. `ConfirmModal` gained a controlled mode, because the
pop-up menu unmounts on the click that chooses an item and would otherwise take an
uncontrolled dialog's overlay with it. Dialog state resets on success, failure and
cancel.

### RBAC (server-enforced, verified)

- Super Admin: any branch; hold/resume; soft delete; category mutation.
- Branch Manager: own branch only; create/edit/activate/deactivate; **no** delete,
  **no** category mutation, **cannot** lift an admin hold.
- `toggle-availability` was widened to admit Super Admin (it was branch-manager-only,
  so an admin had no reason-carrying deactivate path); branch scoping for managers is
  unchanged and a soft-deleted product is rejected.

---

## 11. Cart and checkout revalidation

Unchanged in architecture, now unified in rules. Quote, checkout and order creation
re-read every product from the database through `orderableProductWhere` →
`customerProductWhere`, resolve the variation server-side, re-apply the discount and
recompute unit price, line totals, subtotal, delivery fee and total. Client-submitted
prices are ignored. A product that became ineligible fails the order with a translated
message.

---

## 12. Test evidence

`tests/e2e/54-product-system-sync.spec.ts` — **20 tests, 20 passed**:

no hardcoded product survives · every homepage product is manageable · create appears
publicly · name edit propagates to storefront **and** search · price edit propagates ·
category change moves the section · deactivate hides / reactivate restores · hold
blocks ordering and hides / resume restores · soft delete removes from storefront,
menu, customer API and direct URL (404) · category deactivation hides its products ·
branch deactivation hides all its products and reactivation restores them · checkout
uses the current server price against a forged client price · historical order keeps
its snapshot after rename + reprice + delete · 10 rows per page with a distinct
server-rendered page 2 · search · six filter combinations · action menu opens a named
confirmation and cancel is inert · View page renders real visibility · BM cannot
view/edit/delete another branch's product · BM cannot bypass an admin hold.

Also re-run green: `full-page-audit/admin.spec.ts` product family (5), `01-public-auth`,
`03-permissions`, `24-new-features`, `43-seo-responsive`,
`full-page-audit/public-auth.spec.ts`, `53-customer-home-redirect`.

Stale assertions updated (behaviour change, not weakening): the admin audit asserted
the product list renders **all 66** rows — the required behaviour is now one page of
10, so it asserts page size, the reported total, and per-product reachability through
search; two locators were scoped to `responsive-table` because `ResponsiveDataView`
renders a second, CSS-hidden mobile tree.

### Known failures, diagnosed

| Test | Verdict |
| --- | --- |
| `29-variation-type-visibility-search.spec.ts:358` (foreign delivery area) | **Pre-existing.** Reproduced identically (expected 400, received 201) on the untouched 30 Jul build. Caused by accumulated `test.db` drift, not by this work. |
| `26-nearest-branch-checkout.spec.ts:294` (checkout coverage widget) | **Pre-existing.** Reproduced identically on the 30 Jul build at the same assertion. |
| `full-page-audit/public-auth.spec.ts:433` (forgot-password) | Cross-test pollution — **passes in isolation**. |

No `test.skip`, no `test.only`, no sleeps, no broad retries, no weakened assertions,
no regenerated snapshots.

---

## 13. i18n

EN **3015** keys · BN **3015** keys · **0** mismatches. 23 new keys added to both
(product action labels, activate/deactivate/hold/resume confirmations, deactivation
reason placeholder, deleted badge, visible/hidden-to-customers, last updated, reason,
default variation, enabled/disabled, product search placeholder, homepage badges).
`catalog.deleteProductConfirm` was rewritten in both languages to describe the soft
delete accurately. A static scan of every `t("…")` call found no missing key and no
raw key rendered; storefront category names and section headings render the database
value directly rather than through a lookup that would print a key.

---

## 14. Remaining limitations

1. **Branch Manager catalogue is not paginated** — it still requests `page_size=100`
   over the self-fetch path. The pagination requirement in this task named the Super
   Admin All Products page; the BM list has the new action menu and View page but not
   server pagination.
2. `tests/e2e/full-page-audit/*.spec.ts` hardcodes `http://localhost:3101` in three
   cookie assertions, so that suite only runs on `E2E_PORT=3101`. Pre-existing.
3. The persistent `prisma/test.db` is not reset between runs and the seeder is
   idempotent, so a few specs remain order/state dependent (see §12).
4. Storefront add-ons and choice groups (burger bun/sauce, wing flavours) were part of
   the deleted hardcoded data and have no schema equivalent. The `MenuItem` fields
   remain, unpopulated; sizes come from real `ProductVariation` rows. Modelling paid
   add-ons would need a new table and was outside this task's scope.

---

## 15. Follow-up: nearest-branch scoping (see NEAREST_BRANCH_HOMEPAGE_AUDIT.md)

The catalogue built here was correct but **unscoped**: `publicMenu()` returned
every eligible product across every live branch, so a signed-in customer saw
products from branches that could not serve them. That is now fixed —
`branchMenu(branchId)` scopes an authenticated customer's storefront to their
single nearest eligible branch, and the same scope is enforced on the products
and categories APIs, product detail and the branch menu route.

The authoritative eligibility selector (`customerProductWhere`) is unchanged; the
branch is simply supplied to it. Guests keep the all-branches showcase.

One correction to §6 of this document: a per-branch `unstable_cache` entry was
considered for the scoped catalogue and rejected, because Next 16's
`revalidateTag` is stale-while-revalidate and `updateTag` is Server-Action-only
while every catalogue mutation here lives in a Route Handler. The catalogue is
resolved per request instead. Reasoning recorded in `lib/cache/catalog.ts`.

---

## 16. Follow-up: the brand tab could hide an eligible product

An eligible, admin-managed product could still be invisible on the homepage —
not excluded by any selector, but filtered out client-side by a brand tab that
was hardcoded to `cheez`. Fixed by choosing the opening tab server-side from the
brands that have products, and by showing real per-brand counts. Details in
`SUPER_ADMIN_ORDERING_AUDIT.md`.
