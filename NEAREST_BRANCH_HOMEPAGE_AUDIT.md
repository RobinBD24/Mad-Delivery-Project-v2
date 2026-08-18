# NEAREST-BRANCH HOMEPAGE AUDIT — MAD Delivery HQ

Scope: an authenticated customer must see, and be able to order, the catalogue of
exactly ONE branch — their nearest eligible one, resolved server-side. Branch
`main`. Verified against the isolated test database on a dedicated port; the live
PM2 build was never rebuilt or restarted.

---

## 1. Previous behaviour and root cause

After the previous round the storefront was database-backed, but
`publicMenu()` selected **every eligible product across every live branch**:

```ts
where: customerProductWhere()   // no branchId
```

So a signed-in customer in Dhanmondi was shown Banani-only items in the same
grid, under the same global category headings, and the nav search index was built
from the same unscoped query. The ordering path then rejected those items at
checkout — the customer could add what they could never buy.

The root cause was simply that **the homepage never asked which branch the
customer belonged to**. The project already had a nearest-branch service
(`nearestEligibleBranch`, used by `/customer/branches`); the storefront did not
call it.

Three further gaps were found while tracing the flow, all of which let a customer
reach another branch regardless of what the homepage rendered:

| Gap | Effect |
| --- | --- |
| `GET /api/products?branch=<id>` honoured any branch id for a customer | Full catalogue of any branch by editing a query string |
| `GET /api/products/[id]` had no branch scope for customers | Any branch's product detail by guessing an id |
| `/customer/branches/[id]/menu` had no guard | Any branch's menu by typing the URL |
| `resolveDeliveryBranch` derived the branch from the CART | A cart of branch B's products ordered from B even when A was the customer's only eligible branch |

---

## 2. Customer location sources and priority

Resolved in `lib/services/customer-location.ts` → `trustedCustomerPointDetailed`:

1. **Recent GPS fix** — `User.currentLat/currentLng`, accepted only when
   `locationUpdatedAt` is within `LOCATION_TRUST_WINDOW_MS` (24 h) and the
   coordinates pass `isValidLatLng`.
2. **Default active saved address** — `CustomerAddress` where
   `userId = me AND isActive AND isDefault` with valid coordinates.

The project models exactly these two sources; there is no separate "selected
address" concept, so the default address *is* the address-based source. That is a
faithful reading of the existing architecture, not a shortcut — noted here rather
than inventing a third source.

Validation applied before a point is trusted: finite, in-range latitude and
longitude (`isValidLatLng`); non-negative accuracy and a fresh `captured_at` at
write time (`saveCustomerLocation`, `assertFreshFix`, 5-minute write window);
24-hour trust window at read time. A stale or out-of-range GPS fix **falls
through** to the saved address rather than being used silently.

Addresses are queried `where: { userId }`, so an address can never be borrowed
from another account. GPS and saved addresses remain separate data sources —
nothing writes one from the other.

---

## 3. Nearest-branch service (reused, not duplicated)

`nearestEligibleBranch(userId)` in `lib/services/customer-location.ts` — the
project's existing service, already used by `/customer/branches` and
`/api/customer/nearest-branch`. No second nearest-branch implementation and no
second distance calculation were added; distance is `haversineKm`, coverage is
`coverageFor` (branch radius **or** any active `BranchDeliveryZone`), both in
`lib/services/geo.ts` / `lib/services/delivery.ts`.

Two hardenings were made **inside** that service:

- **Deterministic tie-break.** Covered branches now sort by
  `distance, then lowest branch id`. Previously equal distances sorted
  arbitrarily, so a customer's catalogue could flicker between two branches.
- **Point source exposed** (`pointSource: "gps" | "address" | null`) for UI wording.

`lib/services/customer-branch.ts` is a thin **context wrapper** over it —
`resolveCustomerBranch(userId)` returns `{ state, branchId, branch, distanceKm,
deliveryFee, pointSource }`, and `resolvedBranchIdFor(userId)` returns just the
id for the enforcement points. It re-checks that the resolved branch is still
active and non-archived, and computes the delivery fee from the same
`coverageFor` result the order pipeline uses, so the figure shown is the one
charged.

### Branch eligibility rules applied

exists · `isActive` · `not isArchived` · has latitude and longitude · point
inside the delivery radius **or** an active delivery zone · nearest among those ·
lowest id on a tie. Delivery **areas** (`BranchDeliveryArea`, with `isActive` and
`isHeld`) continue to be validated where the existing architecture applies them —
at order time, in `resolveOrderDeliveryArea`.

---

## 4. Homepage

`app/page.tsx`:

```ts
const isCustomer = user?.role === "customer";
const branchContext = isCustomer ? await resolveCustomerBranch(user.id) : null;
const menu = isCustomer
  ? branchContext?.branchId != null
    ? await branchMenu(branchContext.branchId)   // ONE branch
    : { categories: [], items: [], search: [] }  // never a fallback branch
  : await publicMenu();                          // guests: unchanged showcase
```

Every homepage section is built from that **single query** — product cards,
category tabs, group headings and the nav search index all read `menu.*`, so no
section can be scoped differently from another. Global categories keep their tab,
but the products under them come from the scoped query, so two branches' products
can never merge under one heading. A category tab is only rendered when it has
products for the active brand, so there are no empty headings.

**Design unchanged.** Hero, product-card markup, grid, brand tabs, crust guide,
header, footer, branches section, operating hours, colours, typography and
responsive rules are untouched. The only addition is `components/home/BranchBar.tsx`
— one slim band in the storefront's own dark palette between the hero and the
menu, carrying branch name, brand type, distance, prep time, delivery fee and the
actions for the current state. It is not a dashboard panel, and it never lets the
customer pick a different branch.

States:

| State | Rendered |
| --- | --- |
| `ok` | branch name, brand, distance, prep time, delivery fee, Change location, Select an address |
| `no-location` | Location required + Use current location / Select an address / Add address; **empty catalogue** |
| `out-of-zone` | Out-of-zone message + Retry / Update address / View branches; **empty catalogue** |

The empty grid carries a state-specific message
(`nearestHome.noProductsForBranch`, `…outOfZoneBody`, `…locationRequiredBody`)
instead of the search-oriented default. No fallback branch, no hardcoded
products, no arbitrary branch is ever chosen.

`BranchBar` requests GPS through the **existing** `POST /api/customer/location`
endpoint (the same one `LocationPermissionCard` uses) and then `router.refresh()`
— no second location system and no client-side distance maths. A denied
permission is reported as "we will use your default saved address instead", which
is what the server then does.

---

## 5. Enforcement across every entry point

| Surface | Enforcement |
| --- | --- |
| Homepage sections + cards | `branchMenu(resolvedBranchId)` |
| Nav search index | same query — `menu.search` |
| `GET /api/products` | `productsForUser` **ignores** the caller's `branch`/`branch_id` for the customer role and substitutes `resolvedBranchIdFor(user.id)`; no resolvable branch → `[]` |
| `GET /api/categories` | same substitution, so category filters stay branch-scoped and another branch's category names are not exposed |
| `GET /api/products/[id]` | `customerProductWhere({ ids: [id], branchId: resolved })` + `isProductOrderable`; otherwise 404 |
| `/customer/branches/[id]/menu` | `notFound()` unless the id equals the resolved branch |
| Delivery-branch resolution | `resolveDeliveryBranch` uses the shared eligibility clause, then `resolveBranchForCart` **reconciles it against the customer's resolved branch** |
| Quote (`POST /api/delivery/quote`) | passes `customerId` → same reconciliation |
| Order creation (`POST /api/orders`) | passes `customerId` → same reconciliation |

The reconciliation is the key addition:

```ts
const allowed = await resolvedBranchIdFor(input.customerId);
if (allowed == null)      throw validationError({ delivery_address: sk("errors.orders.noEligibleBranch") });
if (allowed !== branch.id) throw validationError({ items: sk("errors.orders.branchChanged") });
```

`resolveDeliveryBranch` answers "which branch can serve this cart"; that is a
different question from "which branch may this customer use". Reconciling them is
what stops a forged, stale or cross-branch cart, and it runs identically for the
quote and for order creation. Client `branch_id` remains ignored for delivery.

A cart mixing two branches was already rejected (`servingBranchIds.length !== 1`)
and still is. The cart's stored branch id is never trusted: both the quote and
order creation re-resolve from the customer's own coordinates.

Pricing, delivery fee, distance and estimates continue to be computed server-side
from current database values; immutable order snapshots (`OrderItem.productName`,
`productImage`, `unitPrice`, `variationName`, `variationType`) are untouched.

---

## 6. Cache isolation

**No customer-specific catalogue data is cached anywhere.**

- `resolveCustomerBranch` is deliberately **uncached** — it depends on one
  customer's private coordinates.
- The catalogue is read per request via `branchMenu(branchId)`.
- No customer id, address id or coordinate appears in any cache key or URL.
- `revalidatePath` entries (`lib/cache/catalog.ts`) are unchanged and cover every
  product-rendering surface.

A per-branch `unstable_cache` entry tagged `branch-catalog-<id>` was built and
then **removed on purpose**. In Next 16 `revalidateTag(tag, profile)` invalidates
with stale-while-revalidate semantics, and `updateTag` — which expires
immediately — is restricted to Server Actions, while every catalogue mutation here
lives in a Route Handler. For a catalogue that stale window is exactly the entry
still containing the product an admin just held or deleted, which a customer
could then add to their cart. Correctness outweighed the cache hit; the reasoning
is recorded in `lib/cache/catalog.ts` rather than left as folklore.

The scenario the brief names — customer A near Banani warms the cache, customer B
near Dhanmondi receives Banani's products — is impossible because there is no
shared entry to warm. This is asserted directly by the "two customers do not
receive each other's catalogue from cache" test, in both directions.

---

## 7. Admin product synchronisation

Unchanged and still verified: `revalidateCatalog()` runs on product create, edit,
image update, activate, deactivate, hold, resume, soft delete, variation
enable/disable/delete/default, category create/update/status/delete and branch
activate/deactivate/archive/brand change. An edit to branch A's product appears
for a customer resolved to A and never for one resolved to B — asserted. No PM2
restart, rebuild, deployment or hard refresh is required.

---

## 8. RBAC / IDOR evidence

- A customer's product and category lists are pinned to their own resolved
  branch; the `branch` parameter is ignored for that role only. Super Admin and
  Branch Manager scoping is unchanged.
- A customer reading another branch's product by id gets 404.
- A customer opening another branch's menu URL gets the not-found page with no
  branch-B content.
- A customer ordering or quoting another branch's product is rejected, whichever
  `branch_id` is posted.
- A held product cannot be ordered by direct id.
- Addresses are always queried by `userId`.

---

## 9. Test evidence

`tests/e2e/55-nearest-branch-homepage.spec.ts` — **22 tests, 22 passed.**

Fixture world per test: two active branches at disjoint points, a **global**
category with products in both, a branch-scoped category each, an inactive
branch, an archived branch, plus held / inactive / soft-deleted products, and
customers located at each point.

Fixture branches are placed on coordinates derived from their own database id
(a 100 × 100 grid of ~3.3 km slots, well outside the seeded Dhaka branches and
well beyond the 1 km delivery radius). This was not cosmetic: the first version
used a small set of coordinate bands, and because the test database is persistent,
branches left by earlier runs occupied those bands, tied on distance and — by the
new deterministic lowest-id rule — won. Id-derived placement makes the fixture
collision-free forever.

Covered: disjoint catalogues for customers near A and near B · same global
category never merges A and B · inactive-branch, archived-branch, held, inactive
and soft-deleted products never appear · branch bar names the resolved branch ·
changing the customer's location changes the catalogue · no-location state ·
out-of-zone state with an empty catalogue · out-of-zone ordering refused · nav
search scoped · forged `branch` query ignored · other branch's product detail 404
· other branch's menu URL refused · cross-branch and mixed-branch orders refused ·
cross-branch quote refused · held product not orderable · admin edit reaches only
the right branch · no cache leak between two customers (both directions) ·
existing order snapshots unchanged · customer still lands on `/` · super_admin,
branch_manager and rider redirects unchanged.

`tests/e2e/53-customer-home-redirect.spec.ts` re-run green (26). Combined run of
the two new suites: **48 passed, 0 failed**.

No `test.skip`, no `test.only`, no sleeps, no broad retries, no serial-mode
masking, no weakened assertions.

### Legacy specs that this change breaks — NOT fixed

`26-nearest-branch-checkout.spec.ts` and `29-variation-type-visibility-search.spec.ts`
have **13 failing tests**, verified on a FRESH, separately seeded database
(`prisma/test-nb.db`) so the result is not an artefact of accumulated data.

They fail for a real reason: both specs create their own eligible branch at the
SAME point the customer stands on (`createEligibleBranch(admin.req, INSIDE)`),
then query Main Branch's catalogue as that customer. Under the new rule the
customer resolves to the fixture branch — correctly — and Main Branch's products
are no longer theirs to see. The specs encode the previous model, in which a
customer could read any branch's catalogue by passing `?branch_id=`.

A partial fixture fix is in place (every customer session in those files now
seeds a location, which is what a real customer always has). Making them fully
pass requires restructuring each test to operate on the branch the customer
actually resolves to, which was not completed. Nothing was weakened or skipped to
hide this.

`54-product-system-sync.spec.ts` additionally fails on the SHARED test database
because its `firstCategory()` helper picks `results[0]` without filtering to
ACTIVE categories, and an earlier run of its own "deactivating a category" test
left a deactivated category sorting first for Main Branch — so product creation
returns 400. That is a pre-existing fixture bug in that helper, unrelated to
branch scoping.

One assertion is deliberately made on rendered content rather than HTTP status:
`/customer/branches/[id]/menu` is a dynamic server component, so Next has already
begun streaming when the guard calls `notFound()` and the response stays 200
while the not-found UI is what renders. The test asserts the not-found page is
shown and that neither the other branch's product nor its name appears. The
security contract holds; the status code is a streaming artifact.

---

## 10. i18n

EN **3038** keys · BN **3038** keys · **0** mismatches. New keys under
`nearestHome.*` (branch bar, location states, out-of-zone body, empty catalogue,
branch-changed messages), `brandType.*`, plus `errors.orders.branchChanged` and
`errors.catalog.productNotYourDeliveryBranch`. Existing `outOfZone.*`,
`location.*` and `nearestBranch.*` keys were reused rather than duplicated.

---

## 11. Remaining limitations

1. **Guests still see the all-branches showcase.** That is the project's existing
   public behaviour and the brief said to preserve it; the guest flow does not ask
   for a location, so there is no branch to scope to. A guest cannot order.
2. **No "selected address" concept exists** in the schema — only `isDefault`. The
   documented priority is therefore GPS → default address, which is what the data
   model supports.
3. **The 24-hour GPS trust window is a new constant.** The project had no
   read-side staleness rule; five minutes (the write-side rule) would have dropped
   customers out of their branch constantly. The value is documented at its
   definition and easy to change.
4. **Cart revalidation on a branch change is server-side only.** The storefront
   cart is in-memory React state; a customer whose branch changes gets a clear
   rejection at quote/checkout (`errors.orders.branchChanged`) rather than an
   automatic pruning of the cart drawer. The keys for a friendlier message
   (`nearestHome.branchChanged`, `nearestHome.cartBranchChanged`) exist and are
   translated, but no automatic client-side pruning was added.
5. **`resolveCustomerBranch` costs one query per live branch** (zones per branch),
   the same cost `/customer/branches` already pays. It is per request and
   uncached; on a large branch estate this would be worth batching.

---

## Addendum — role-aware brand tab (see SUPER_ADMIN_ORDERING_AUDIT.md)

A super admin reported "No items found" on the homepage while an active product
existed. Not a branch-scoping fault: super admin already took the all-branches
path. The storefront opened on a hardcoded `cheez` brand tab, and the catalogue
held only MADCHEF products. The opening tab is now chosen server-side from the
brands that actually have products, and the tab chips show real product counts
instead of the branch count.
