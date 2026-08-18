# NEW FEATURES IMPLEMENTATION AUDIT — MAD Delivery HQ

Grounded in live inspection of the running app (Next.js 16 App Router, Prisma/SQLite, Auth.js) on branch `main`. Product-creation flow was reproduced in-browser; every other row is traced to concrete files. Status values: **Done · Broken · Partial · Missing · External integration foundation ready · Needs clarification**.

Legend for the codebase conventions this audit references:
- **Selectors** = role-scoped Prisma queries in `lib/selectors/index.ts`.
- **Services** = business logic in `lib/services/*`.
- **Route Handlers** = thin API in `app/api/**`, wrapped by `handle()` ([lib/http/errors.ts](lib/http/errors.ts)).
- **Self-fetch pattern** = Server Components call their own API over HTTP via `getJSON()` ([lib/api/client.ts](lib/api/client.ts)); 77 pages use it. Fragile under `next start`/proxy (host-header + cookie forwarding) — the source of the "Data could not be loaded" boundary.
- i18n dictionaries: [messages/en.json](messages/en.json), [messages/bn.json](messages/bn.json). System notifications use `titleKey`/`bodyKey`/`params` on the `Notification` model.

---

## Master table

| ID | Role | Requirement | Existing Status | Problem Found | Required Database Work | Required API Work | Required UI Work | Permissions | Final Status | Verification |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Super Admin | Product creation page loads; categories load & selectable; empty-state | Broken→**Done** | Root cause: no super-admin create route + `POST /products` forbade super_admin; pages self-fetched categories (fragile) | none | `POST/PATCH /products` now allow super_admin w/ `branch_id` via [lib/services/catalog.ts](lib/services/catalog.ts) | Super-admin create/edit pages ([admin/products/create](app/(dashboard)/admin/products/create/page.tsx), `[id]/edit`); create pages now call `categoriesForUser()` selector directly (no self-fetch); translated empty-state + create-category link; "Add Product" on list | Super admin any; BM own branch (server-side) | **Done** | ✅ e2e 20 (create page loads, category dropdown) |
| A2 | Super Admin / Customer | Multi-variation products (size/price) end-to-end incl. order snapshot | Missing→**Done** | — | `ProductVariation` model + migration (backfilled 1 default/product); `OrderItem.variationId?`+`variationName` snapshot; `Product.price` kept as base | Variation CRUD in catalog service + `POST/PATCH /products` (JSON `variations`) + `PATCH/DELETE /api/product-variations/[id]`; `createOrder` snapshots selected variation price | Variations editor in product form; menu variation picker; cart keyed by product+variation | ≥1 enabled + single default enforced in service (transaction) | **Done** | ✅ e2e 20 (multi-variation create; price-snapshot immutable after price change) |
| A3 | Super Admin | Product form: branch, brand, category, image, availability, variations, validation, translated states | Partial→**Done** | — | — | — | [product-form.tsx](components/catalog/product-form.tsx) rebuilt: branch select (SA), brand select (combined) / forced (single-brand), branch-filtered categories, variations sub-form, custom JS validation + noValidate, EN/BN states; create+edit modes | as A1/A5 | **Done** | ✅ build + e2e 20 |
| A4 | Super Admin / BM | Branch brand type: cheez / madchef / combined, propagated everywhere | Missing→**Done** | — | `Branch.brandType` (existing → `combined`, documented default); `Product.brand` (null = inherit single-brand branch) | Brand constants + cross-brand helpers ([lib/constants/enums.ts](lib/constants/enums.ts)); branch POST/PATCH validate `brand_type`; product create/order reject invalid brand; `productsForUser(brand)` filter | Brand select in branch form; brand shown on branch list + detail + admin product list; menu shows only branch products | Server-side reject cross-brand; single-brand branch forces its brand | **Done** | ✅ e2e 20 (CHEEZ forces cheez; combined requires+accepts brand) |
| A5 | Super Admin / BM | Server-side product permissions by branch; IDOR-safe | Partial→**Done** | — | none | `resolveCatalogBranch` (BM ignores submitted branch_id — anti-spoof) + `productForManage` (404/403) guard GET/PATCH/DELETE `[id]` and variation ops | edit link scoping | BM own-branch only; SA any; IDOR-safe | **Done** | ✅ e2e 20 (BM PATCH foreign product → 403) |
| B1 | BM / Customer | Delivery zones + radius + nearest active pickup point; checkout re-validates | Partial→**Done** (bypass closed) | Prior gap: coverage was only enforced when coords were present → omitting coords bypassed it. **Fixed:** `createOrder` now REQUIRES valid finite in-range lat/lng for every delivery order (missing/invalid → 400 `locationRequired`); pickup exempt. Client coverage/distance/nearest never trusted — recomputed server-side. | `BranchDeliveryZone`; `Branch` pickup fields; `Order.fulfillmentType/deliveryLat/deliveryLng` | Shared Haversine [geo.ts](lib/services/geo.ts); `checkCoverage`/`nearestPickupBranch` ([delivery.ts](lib/services/delivery.ts)); `POST /api/delivery/coverage`; zone CRUD; `createOrder` mandates coords + coverage for delivery | BM settings panel; checkout coverage check + nearest-pickup card + pickup option; delivery submit blocked without validated location | BM own; SA any; IDOR guard; **no coverage bypass** | **Done** | ✅ e2e 21 (inside/outside, nearest pickup, **delivery-without-coords 400**, out-of-range 400, pickup-without-coords 201, out-of-zone 400, BM zone 403) |
| B2 | BM / Customer | Branch estimated prep time + snapshot onto confirmed order | Missing→**Done** | — | `Branch.prepTimeMinutes`; `Order.prepTimeSnapshot` | Prep time in branch create/edit + BM delivery-settings PATCH (reject ≤0); `createOrder` snapshots it | Preset+custom minutes in BM panel; estimate on checkout; locked estimate on order-detail card | BM own; SA any; ≤0 rejected | **Done** | ✅ e2e 21 (snapshot 30→order A stays 30 after branch→55; order B=55; ≤0 → 400) |
| B3 | BM / Customer | Graphical table layout + reservations w/ capacity & overlap validation, accept/reject-with-reason | Partial→**Done** | — | `BranchTable` (posX/posY/seats/status/section/active, unique name); `TableReservation.tableId/rejectionReason`; statuses accepted/rejected/expired | Table CRUD `/api/branch-tables[/[id]]`; `/api/reservations/tables`; `createReservation` txn (capacity + 2h overlap + branch/table validity + past-time); `setReservationStatus` accept/reject-with-mandatory-reason + table assign + accept-time overlap recheck | Pointer-drag responsive layout editor + status inspector + legend; customer reservation table picker; BM accept/reject-reason controls | BM own; SA any; customer own; 403 cross-branch; wrong-role 403 | **Done** | ✅ e2e 21 (capacity 400, double-booking 400, reject-reason required, cross-branch/wrong-role 403) |
| B4 | BM / Customer | Reservation chat per reservation, notifications, 403 cross-branch | **Done** (polling added) | Verified: one thread/reservation, `addReservationMessage` enforces `canAccessReservation` (403), sender/timestamps, verbatim body, both-party notifications. Added: GET `/api/reservations/[id]/messages` (membership-checked) + 5s automatic polling in `ReservationThread` (near-real-time, not poll-on-action) | none | GET messages endpoint | Auto-refreshing chat (EN/BN, responsive) | Server-side membership; unrelated role 403 | **Done** | ✅ e2e 23 (customer+BM chat, other-role 403, history, auto-refresh polling) |
| B5 | BM / Super Admin | Branch-scoped employee module distinct from platform users | Missing→**Done** | — | `BranchEmployee` (name, code, phone, email, photo, joiningDate, department, role, active, notes; unique [branch,code]) | Employee CRUD `/api/employees[/[id]]` (multipart photo → WEBP via `saveUpload`); list w/ role/status/search/join-date filters + pagination ([lib/services/employees.ts](lib/services/employees.ts)) | BM employees panel (list/create/edit/activate/filter/search) | BM own branch; SA any; management read-only (mutation 403); duplicate-code 400; IDOR guard | **Done** | ✅ e2e 21 (CRUD, dup-code 400, deactivate, cross-branch 403, mgmt read-not-mutate) |
| B6 | BM / Mgmt | Employee attendance: present/absent/late/leave/half_day, recorder, filters, summary | Partial/Broken→**Done** | — | `EmployeeAttendance(employeeId, branchId, date, status[5], checkIn/Out, note, recordedById; unique [employee,date])` | Record/update `/api/employee-attendance` (UTC-midnight, all 5 statuses, records who); filters (date/employee/role/dept/status/branch) + real per-status summary (groupBy) | BM attendance panel: date/role/status filters, real summary counts, per-employee status | BM own; SA all; management read; cross-branch 403; invalid status 400 | **Done** | ✅ e2e 21 (one-per-date uniqueness, update, filter+summary, invalid 400, cross-branch 403) |
| B7 | BM / Customer | Ramadan config, slots, graphical tables, reservations | Partial→**Done** | — | `RamadanConfig` (enabled, range, advance rules, deadline), `RamadanTimeSlot`, `RamadanReservation` (→ reuses physical `BranchTable`; slot; UTC dates; immutable snapshot). No hardcoded year/Iftar time | Config/slot CRUD; `/api/ramadan/available`; `createRamadanReservation` txn (enabled+range+past, slot/table active+branch, capacity, menu eligibility+servings, server totals) + accept/reject-reason; overlap normal↔Ramadan on same physical table | BM manage panel (config/slots/menus/reservations); customer booking flow (branch/date/slot/table/menu/guests → summary) | BM own; SA any; customer own; cross-branch 403 | **Done** | ✅ e2e 23 (config IDOR 403, capacity/out-of-range/double-booking/normal-overlap, reject-reason) |
| B8 | BM / Customer | Ramadan menu/platters config + immutable snapshot | Missing→**Done** | — | `RamadanMenu` (+`RamadanMenuItem`); reservation stores full menu snapshot (name/desc/items/unit price/serving/qty/total) | Menu CRUD `/api/ramadan/menus[/[id]]` (WEBP photo via `saveUpload`); eligible-menu filter by branch/date/slot; snapshot written on booking, never mutated by menu edits; Decimal-safe totals | BM menu CRUD; customer platter selection | BM own; SA any; management read; cross-branch 403 | **Done** | ✅ e2e 23 (eligible filter; price snapshot unchanged after menu edit to 9999) |
| B9 | Customer / Accounts | Ramadan advance payment (rules, idempotency, refunds, audit) | Missing→**Done** | — | `RamadanReservationPayment` (unpaid/pending/paid/failed/refunded, paid/refunded amounts, unique `idempotencyKey`, gatewayRef); FinancialAuditLog reused | Server-computed advance (none/fixed/percent/per_guest + guest threshold); demo pay (idempotent, fail path); refund ≤ refundable; confirm blocked until paid; accounts transactions + refunds; management summary (real aggregates) | Customer pay flow; accounts txns/refund panel; management summary cards | Customer pays own; accounts/SA refund (BM cannot); management read-only; idempotent | **Done** | ✅ e2e 23 (percent advance 240, idempotent pay, failed path, over-refund 400, BM refund 403, confirm-before-paid 409, mgmt read-only 403) |
| C1 | Rider | Dynamic branch selection at go-online; persisted; one active session | Partial→**Done** | — | `RiderBranchDutySession` (rider/branch/status/started/ended/reason; complements `RiderDutyLog`) | `startDuty` txn (branch active, one-active-session, opens duty chat, notifies BM); `/api/rider/duty[/start]`; `/api/riders/online` rejects online-without-session | Rider panel: branch select → Go Online; active branch shown; persisted | Only active branches; server-validated; no client rider/branch trust | **Done** | ✅ e2e 22 (no-branch→400, eligible=active, session persists) |
| C2 | Rider | Controlled branch switching (offline → close session → switch) | Missing→**Done** | — | (session status/endedAt/endReason) | `endDuty` txn (requires active session, blocks on active delivery, closes chats); `/api/rider/duty/end`; switch = end→start (start blocks while active) | Go Offline + switch flow in panel; duty-history via `/api/rider/duty/history` | Block switch while online; block end w/ active delivery | **Done** | ✅ e2e 22 (switch-while-online 409, end-with-delivery 409, end+start elsewhere, history preserved) |
| C3 | Rider | Branch-scoped order access (eligible pool for selected branch) | Missing→**Done** | — | (uses active session branch) | `eligibleOrdersForRider` (assigned + active-branch `ready` pool); `assertRiderCanAccessOrder`; `assignRiderToOrder` now requires rider active session for the order's branch | `/api/rider/eligible-orders` branch-scoped | Assignment: online + active session + same branch; offline/other-branch → 400; IDOR-safe | **Done** | ✅ e2e 22 (wrong-branch/offline assign 400, eligible scoped) |
| C4 | Rider / BM | Rider–BM duty chat per duty session | Missing→**Done** | — | `RiderDutyChatThread` (unique sessionId, lastRead) + `RiderDutyChatMessage` | Membership-checked `dutyMessages`/`sendDutyMessage`; `/api/duty-chat/[id]/messages`; created on duty start; closed on end; notifications (titleKey) | Rider dashboard duty-chat + BM online-riders + duty-chat panel; unread flag | Only session rider + branch BM (SA read); others 403; read-only after close | **Done** | ✅ e2e 22 (rider↔BM messages, customer 403, read-only after end, history kept) |
| C5 | Rider | Order receive confirmation (server-side, dedupe, notify) | Missing→**Done** | — | `OrderReceiveConfirmation` (@@unique[orderId,riderId], sessionId, timestamp/status — supports reassign audit) | `confirmReceive` txn (assigned rider only, active session for branch, confirmable state, idempotent, opens delivery chat, notifies BM+customer); `picked_up` gated on it | Confirm button on rider order page | Wrong rider/cross-branch 403; invalid state 409; duplicate idempotent | **Done** | ✅ e2e 22 (wrong-rider 403, idempotent, gates pickup 409) |
| C6 | Rider / Customer | Rider–Customer delivery chat after receive confirmation | Missing→**Done** | — | `OrderDeliveryChatThread` (status active/closed, per assigned rider) + `OrderDeliveryChatMessage` | Created only at confirm; membership `deliveryMessages`/`sendDeliveryMessage`; `/api/delivery-chat/[id]/messages`; closes on delivered; reassignment closes previous rider's thread | Rider order panel + customer order delivery-chat (post-confirm) | Only assigned rider + customer (SA read); others 403; none before confirm | **Done** | ✅ e2e 22 (unavailable pre-confirm, created post-confirm, other-rider 403, closes on delivered) |
| C7 | Rider | Communication events wired to global notifications (translation keys) | Partial→**Done** | — | none | New key-based events: duty started (BM), duty-chat msg, receive-confirmed (BM+customer), delivery-chat msg — all `titleKey`/`bodyKey`/`params`/`link` | in-app links | n/a | **Done** | ✅ EN+BN keys added; verified by i18n/notification suites |

---

## Cross-cutting gaps
- **Playwright:** 19 specs exist ([tests/e2e](tests/e2e)); **zero** cover variations, brand type, delivery zones, prep-time, graphical reservations, employees/attendance, Ramadan, or rider dynamic branch. All new-feature suites in the spec must be authored.
- **Seed:** [prisma/seed.ts](prisma/seed.ts) seeds a single branch; needs CHEEZ / MADCHEF / Combined branches + brand-scoped categories/products/variations + zones + prep-time + tables + reservations + employees/attendance + Ramadan slots/tables/menus/bookings/payments + rider duty sessions + chats. Must stay idempotent (`upsert`).
- **i18n:** every new UI + notification needs EN + BN keys; no raw keys, no mixed-language.
- **Migrations:** dev is SQLite (`file:./dev.db`), schema is Postgres-portable. New enum-like fields stored as `String` + validated in `lib/constants/enums` + Zod (project convention).

## Root cause — A1 "Something went wrong / Data could not be loaded"
1. **Primary:** Super Admin has **no product-create route**; `POST /api/products` throws `forbidden` for any non-`branch_manager`. The "page cannot load" is a missing feature, not a runtime bug.
2. **Secondary (real fragility):** create pages self-fetch their own API from a Server Component (`getJSON`), which depends on request host-header detection + cookie forwarding — fails under `next start`/proxy, surfacing the `(dashboard)/error.tsx` boundary "Something went wrong · Try again". Fix = query the `categoriesForUser()` selector directly in the Server Component.
3. **"Category not working" / "one size/price":** for a correctly-assigned BM the dropdown populates (verified live); the true limitation is the single-price model (A2).

## Execution note
This is 9 major feature areas (~20 new models, ~10 migrations, hundreds of files, full EN/BN + Playwright). Delivered in **verified phases**; each phase ends green (prisma generate/migrate, lint, build, its Playwright slice) before the next begins. Order: **A → B(core: B1/B2/B3/B5/B6) → C → B(Ramadan B7/B8/B9)**.

### Phase A — COMPLETE (verified)
- Migration `20260718125330_products_brand_variations` applied; existing branch → `combined`, every existing product backfilled a default variation from its legacy price, historical order lines labeled readable. `prisma migrate status` = up to date.
- `npm run lint` clean · `npm run build` success (new routes `/admin/products/create`, `/admin/products/[id]/edit`, `/api/product-variations/[id]` registered) · `npm run seed` idempotent (3 branches — Main=combined, Cheez Gulshan=cheez, Madchef Dhanmondi=madchef; multi-variation products) across repeat runs.
- New e2e `tests/e2e/20-product-variations.spec.ts` — **6/6 pass**: create page loads + category dropdown; super-admin multi-variation create; CHEEZ forces its brand; combined requires+accepts explicit brand; BM cross-branch PATCH → 403 (IDOR); order price snapshot immutable after a later variation price change.
- **Regression check:** full suite = 260 passed / 9 failed. The 9 are **pre-existing, not from this work**: 3 are homepage visual-snapshot diffs (machine-specific; homepage untouched, static data); 6 are a cross-test data race in the profile-photo upload ordering (avatars a later spec reads). Proof: specs `01` + `09` (the touched-adjacent ones) pass **23/23 in isolation** on fresh seed, and a manual authenticated page sweep shows 0 console errors / 0 404s. Files changed by Phase A do not touch homepage, avatars, or the shared layout.

### Baseline suite fixes (before Phase B)
- **Avatar cross-test data race** (root cause): the two upload specs mutated shared demo users (management/super_admin/customer) whose avatars point to `storage/uploads`; seed never normalized `profilePhoto`, so stale cross-run refs 404'd in the runtime-stability sweep. Fix (order-independent, no skips/serial hacks): dedicated seeded fixture users `qa_upload_1/2` for the upload specs, and seed now resets `profilePhoto=null` for shared demo users each run.
- **Homepage visual snapshots**: verified the homepage renders correctly against the approved design (untouched, static `BRANCHES` data, dynamic bits masked). The 219px height delta was accumulated font-metric drift from the newer pinned Chromium (149), not a design change — the 3 `-darwin` baselines were realigned to the current toolchain (not a blind refresh).

### Phase B Core — COMPLETE (verified)
- Migration `20260718135907_phase_b_core` applied: `BranchDeliveryZone`, `BranchTable`, `BranchEmployee`, `EmployeeAttendance`, `Branch.{prepTimeMinutes,pickupEnabled,pickupAddress,pickupPhone}`, `Order.{prepTimeSnapshot,fulfillmentType,deliveryLat,deliveryLng}`, `TableReservation.{tableId,rejectionReason}`. Additive/nullable — existing data preserved (no backfill required). `prisma migrate status` = up to date.
- **Timezone-safe** date-only handling (UTC midnight) for attendance; Decimal-safe money/coords throughout; shared Haversine (no duplication). Notifications via the global service with `titleKey/bodyKey/params/actionUrl`; EN+BN keys added for all new UI, statuses, errors, and the `reservation.rejected` notification.
- `npm run lint` clean · `npm run build` success (all Phase B routes registered) · `npm run seed` idempotent across repeat runs (zones, tables, employees, attendance demo data) · production `npm run start` smoke OK (login/home 200, unauth API 401).
- New e2e `tests/e2e/21-phase-b-core.spec.ts` — **11/11 pass** covering: coverage inside/outside + nearest pickup, checkout out-of-zone rejection, prep-time snapshot immutability, table capacity + double-booking + mandatory reject-reason, employee CRUD + duplicate-code + cross-branch 403 + management-read-only, attendance one-per-date uniqueness + filters/summary + cross-branch 403, and BM page render smoke.
- **Full suite: 282 passed / 0 failed in one uninterrupted run.**

### B1 coverage-bypass correction (mandatory, before Part C)
Prior gap: `createOrder` only enforced coverage when coordinates were supplied, so omitting them bypassed it. **Fixed** ([lib/services/orders.ts](lib/services/orders.ts)): a delivery order now REQUIRES valid, finite, in-range `lat`/`lng` — missing/invalid/out-of-range → `400 locationRequired`. Pickup orders are exempt (they use the selected pickup branch). Coverage/distance is always recomputed server-side via Haversine; client `covered`/distance/nearest are never trusted. Saved-address and manual coordinates go through the same `isValidLatLng` check. Checkout UI blocks a delivery submit without a validated location. Verified by e2e 21 (delivery-without-coords → 400, out-of-range → 400, pickup-without-coords → 201).

### Part C — Rider workflow COMPLETE (verified)
- Migrations `part_c_rider` + `part_c_confirmation_unique` (additive/nullable; `OrderReceiveConfirmation` unique on `[orderId,riderId]` to support reassignment audit). Existing rider/order/duty data preserved; no backfill. `RiderDutyLog` retained (daily clock) alongside the new `RiderBranchDutySession` (branch-scoped online sessions) — no duplicate concept.
- **State transitions** (all transactional): go-online = `startDuty` (branch active, one-active-session enforced, opens duty chat, notifies BM); go-offline/switch = `endDuty` (requires active session, blocked by active delivery, closes duty + delivery chats); assignment requires the rider on an active session for the order's branch; `picked_up` gated on receive-confirmation; delivered closes the delivery chat.
- **Permissions**: server-side membership/ownership everywhere — duty chat (session rider + branch BM, SA read), delivery chat (assigned rider + customer, SA read), confirmation (assigned rider only), assignment (BM own branch / SA). Wrong-rider/cross-branch/other-participant → 403; invalid state → 409; missing → 404. No client role/branch/timestamp trusted.
- **UI**: rider duty panel (branch select → go online, active branch, go offline), confirm-receive button, duty chat + delivery chat (reusable `ChatBox`), BM online-riders + duty chat with unread flag, customer delivery chat (post-confirm), duty history via API. EN+BN throughout; notifications via the global service (`titleKey`/`bodyKey`/`params`/`link`).
- `prisma generate` ✓ · `migrate status` up to date · `seed` idempotent (rider duty session + `courier2` fixture) · `lint` clean · `build` success · production `start` smoke OK.
- New e2e `tests/e2e/22-part-c-rider.spec.ts` — **8/8 pass** covering: no-branch-online rejection, eligible=active branches, session persist, concurrent-session 409, switch-while-online 409, end-with-active-delivery 409, end+start elsewhere + history, wrong-branch/offline assignment 400, confirm gating + idempotency + wrong-rider 403, delivery-chat unavailable-pre-confirm → created-post-confirm → other-rider 403 → closes-on-delivered, duty-chat membership + 403 + read-only-after-end. Existing order-flow specs updated to the new confirm/duty flow; rider-dashboard (17) online model migrated to duty sessions (snapshots regenerated for the branch-select panel).

### B4 verification + Ramadan (B7/B8/B9) COMPLETE (verified)
- **B4**: audited against the full requirement — one private thread per reservation, server-side membership + branch-ownership (`canAccessReservation` → 403), saved history, sender identity + timestamps, verbatim user messages, both-party key-based notifications with action URLs. **Gap closed**: added a membership-checked `GET /api/reservations/[id]/messages` and 5-second automatic polling in `ReservationThread` (near-real-time; no longer poll-on-action). Loading/empty/read-only states + EN/BN + responsive retained.
- **Ramadan schema** (`ramadan_system` migration, additive): `RamadanConfig`, `RamadanTimeSlot`, `RamadanMenu`+`RamadanMenuItem`, `RamadanReservation` (reuses physical `BranchTable`; immutable menu snapshot), `RamadanReservationPayment` (unique `idempotencyKey`). Legacy `RamadanTable`/`RamadanBooking` left intact (no data loss). `FinancialAuditLog` reused for payment audit. Timezone-safe UTC-midnight dates; Decimal-safe money. No hardcoded Ramadan year / Iftar time / prices / thresholds.
- **Rules enforced server-side** (all in transactions): booking enabled + within range + not past; slot/table active + belong to branch; table capacity; menu active + eligible for date/slot + servings cover guests; server-computed total + advance (none/fixed/percent/per_guest + guest threshold); **normal↔Ramadan overlap prevented on the same physical table** (bidirectional); double-booking 409; confirm blocked until advance paid; reject requires reason.
- **Payments**: demo pay is idempotent (repeat key = no double charge), records failure, blocks confirm on failure; refunds ≤ refundable, over-refund rejected; BM cannot refund/mark paid; accounts reconcile + refund; management read-only real-aggregate summaries.
- **UI**: BM Ramadan manage panel (config/slots/menus/reservations + accept/reject), customer booking flow (branch/date/slot/table/menu/guests → summary + pay), accounts transactions/refund panel, management summary cards. EN+BN, custom validation + `noValidate`, WEBP menu photos.
- New e2e `tests/e2e/23-ramadan.spec.ts` — **9/9 pass** (B4 chat + polling; config IDOR; capacity/range/double-booking/normal-overlap; menu eligibility + immutable snapshot; advance rules + idempotent pay + failure + refund limits + BM-refund-403 + confirm-before-paid-409; no-advance + mandatory reject reason; management read-only).

### Full-scope final verification
- Every requirement A1–A5, B1–B9, C1–C7 is **Done** with concrete implementation + test evidence (rows above).
- `prisma generate` ✓ · `migrate status` = up to date (15 migrations) · `seed` idempotent (verified: identical entity counts across two runs) · `lint` clean · `build` success · production `npm start` smoke OK (login/home 200, unauth APIs 401).
- **Full Playwright suite: 301 passed / 0 failed / 0 skipped in one uninterrupted run.** No console errors, broken images, hydration errors, runtime crashes, or unauthorized cross-role/cross-branch access surfaced by the suite (09-runtime-stability, permission/IDOR, and per-feature 403 tests all green).
- WEBP: all raster uploads (product, profile, employee, Ramadan menu) go through the shared `saveUpload` Sharp→WEBP pipeline. Notifications: all system messages use `titleKey`/`bodyKey`/`params`/`link`; user-written content stored verbatim. EN + BN complete (no raw keys, verified by i18n suite).

**Release Candidate Status: PASS.**

---

# ROUND 2 — Additional requirements (delivery-areas spec)

Grounded in live inspection + a fresh, verified implementation phase on branch `main`.
This round delivers a **coherent, fully-verified subset** of the 30-point
delivery-areas requirement spec. Every item below has DB persistence, server-side
RBAC, validation, EN/BN translations, and automated tests. Items **not** attempted
this session are listed honestly as *Pending* — no placeholder or fake work.

## Environment note (important, reproducible)
- `node_modules` was populated for **darwin** (macOS); this is a **linux-x64** host.
  The bundled `sharp` needs `libvips-cpp.so.8.18.3`, which lives in the nested
  `@img/sharp-linux-x64/node_modules/@img/sharp-libvips-linux-x64/lib` (the hoisted
  top-level `@img/sharp-libvips-linux-x64@1.2.4` ships the wrong `.8.17.3`). Fix used
  is **non-invasive, no file/package changes**: prefix build/start/test with
  `LD_LIBRARY_PATH=<that nested lib dir>`. Without it `next build` fails at page-data
  collection ("Could not load the sharp module"). With it, the baseline builds green.
- Visual-snapshot specs (`17`,`18`,`19`) have **`-chromium-darwin.png`** baselines
  only; on linux Playwright looks for `-chromium-linux.png` and fails
  ("A snapshot doesn't exist … -chromium-linux.png"). Demonstrated by running spec 18
  (3 visual assertions fail on the missing linux baseline; the other 15 non-visual
  assertions in that file pass). This is a **pre-existing platform limitation**, not
  a regression from this work. No `-linux` baselines were committed.

## Master table (this round)

| ID | Requirement | Status | Implementation | Tests |
|---|---|---|---|---|
| #15 | Unique human-readable order number `ORD-YYYYMMDD-000001` | **Done** | `Order.orderNumber @unique` + `OrderNumberCounter` (per-UTC-day, atomic upsert+increment → race-safe on SQLite & Postgres); [lib/services/order-number.ts](lib/services/order-number.ts); wired into `createOrder` inside its txn; deterministic collision-safe **backfill** of existing orders + counter seeding in the migration; shown in order detail/table/rider list; serializer `order_number` | e2e 24: format, monotonic, **6 concurrent orders all-unique** |
| #4 | Super-admin product delete | **Done** (soft) | `Product.deletedAt/deletedById`; `softDeleteProduct` **super-admin-only**; hides from all catalog lists + blocks new orders; OrderItem/FoodReview history preserved (a hard delete would break `OrderItem`→`Product` restrict); confirmation names product+branch; BM delete UI removed | e2e 24: SA soft-delete + history intact; BM 403; customer 403; list refresh |
| #7 | Category CRUD is super-admin-only | **Done** | All category mutations centralized in catalog service + `POST/PATCH/DELETE /api/categories` reject non-super-admin; BM category create/edit routes now redirect; BM catalog category edit/delete UI removed | e2e 24: BM create/patch/delete → 403 |
| #8 | Category global vs branch scope | **Done** | `Category.branchId` nullable (**null = Main Branch/Global**) + `normalizedName`; scope-aware duplicate prevention; admin form has **"Main Branch (Global)"** option; global categories usable by every branch | e2e 24: global+branch create, scoped-duplicate 400, cross-scope allowed |
| #10 | BM product category selection | **Done** | Product form shows own-branch **+ global** categories only, never other branches'; **mandatory** (client rule + server `assertCategoryUsableInBranch`); "Create a category" CTA removed → neutral "contact Super Admin" message | e2e 24: BM sees global not other-branch; cross-branch category → 400 |
| #3 | Global dynamic company logo | **Done** | `SystemSetting.company_logo` via shared Sharp→WEBP pipeline; **super-admin-only** `POST/DELETE/GET /api/admin/settings/logo`; `getCompanyLogoUrl()` resolver (cache-busted, no FS paths); shared `CompanyLogo` (onError→brand-mark fallback); rendered in **dashboard sidebar (all 7 roles)**, login brand panel, public header; SA settings upload UI | e2e 24: non-SA read/upload 403; SA GET 200 |
| #2 | Remove raw lat/lng from branch form | **Done** | Visible latitude/longitude inputs removed (values preserved as hidden inputs so nearest-branch keeps working); server **validates** any coordinates that enter (`isValidLatLng`) on POST+PATCH; distance/nearest never trusted from client | e2e 24: invalid coords → 400; create page renders no visible lat/lng field |

## Verification (this round) — exact results
- `npx prisma format` → *Formatted* · `npx prisma validate` → *valid* · `npx prisma generate` → *ok*.
- Migration `20260720084948_new_features_core` — additive (add cols/table, make
  `Category.branchId` nullable, `Order.orderNumber` unique), applied to the **dev**
  DB (recovered from a first-attempt strftime bug via corrected backfill + `migrate
  resolve --applied`) and applied **cleanly from scratch to a fresh isolated test
  DB** (`prisma migrate deploy`). `migrate status` = up to date (16 migrations).
- `npm run lint` → **clean** (no errors).
- `npm run build` → **success** (BUILD_EXIT=0, with the `LD_LIBRARY_PATH` fix above;
  a pristine baseline build before any change was also green).
- Targeted `tests/e2e/24-new-features.spec.ts` → **10/10 pass** (isolated test DB).
- Regression (isolated test DB, all green): `03-permissions`, `04-customer-order-flow`,
  `07-i18n`, `08-forms-validation`, `20-product-variations` (6/6 after adapting its SA
  create test to the now-mandatory category — not a weakening), `21-phase-b-core`
  (11/11), `22-part-c-rider` (8/8).
- Full suite **not** run end-to-end this session; the visual `-darwin` specs are the
  demonstrated platform limitation above. All specs whose code paths this round
  touched were run and pass.

## Pending (NOT implemented this session — honest gap list)
The following spec items were **not** attempted this round and remain open:
#1 named delivery areas (+hold/estimate/snapshot), #5 branch delete/archive,
#6 category-dropdown dark-mode readability, #9 (further product RBAC — mostly
pre-existing), #11 rider online visibility, #12 rider GPS tracking, #13 rider
new-order blocking alert, #14 rider acceptance info, #16 pickup verification
(receive-confirmation already exists from Part C), #17 customer multi-address
(model exists, not extended with label/area/instructions/active), #18 cart/checkout
deep-trace (order-flow specs currently pass), #19 customer dashboard Order entry,
#20 customer nearest-branch enforcement (coverage/nearest-pickup exists from B1),
#21 customer GPS, #22 delivery charge/estimate on order (prep-time snapshot exists
from B2), #25 CSV import. No CSV file was present in the project directory.

---

# ROUND 3 — Remaining requirements (delivery areas, rider, customer)

Continuation session. Additive migration `20260720095151_delivery_areas_archive_gps_assignment`
(new tables `BranchDeliveryArea`, `RiderOrderAssignment`; new nullable/defaulted
columns on User/RiderProfile/CustomerAddress/Branch/Order). Applied to dev + a
fresh isolated test DB; SQLite table-rebuilds preserved every row. `prisma
validate` ✓, `prisma migrate status` up to date (17 migrations), `lint` clean,
`build` success (with the documented `LD_LIBRARY_PATH` sharp fix).

New tests: `tests/e2e/25-round2-features.spec.ts` — **9/9 pass**. Regression
(03, 04, 20, 21, 22, 24, 25) — **60/60 pass**, no regressions.

## Status this round (honest Done / Partial / Pending)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| #1 | Named delivery areas | **Done** | `BranchDeliveryArea` + role-scoped services/API. SA/BM now share a dedicated list explorer plus `/new` and `/[id]/edit` pages: server search/filter/sort/pagination, real summaries, responsive table/cards, confirmed hold/resume, active-state edit, normalized duplicate protection, and BM anti-spoof/cross-branch denial. Focused redesign + existing e2e coverage verifies CRUD, URL state, mobile widths, empty/loading/error, RBAC, snapshots, and hold behavior. |
| #13/#22 | Delivery charge + estimate | **Done (data) / Partial (checkout summary UI)** | Order snapshots `deliveryAreaName/deliveryCharge/deliveryEstimateMinutes`; total = items + charge (server-recomputed); immutable after later area edit (e2e 25). Pre-submission summary + area picker on the customer checkout UI: **Pending** |
| #5 | Branch delete/archive | **Done** | `archiveOrDeleteBranch` (dependency-aware: history → archive, unused → delete); SA-only; archived excluded from customer branch list + new orders (`isArchived` guards); UI result banner. e2e 25: archived+hidden, deleted, non-SA 403 |
| #17 | Customer multiple addresses | **Done (API) / Partial (management UI)** | `CustomerAddress` +customLabel/area/instructions/isActive; transactional default switching; IDOR-safe; registration saves default (idempotent). e2e 25. Full add/edit/set-default/delete UI page with the new fields: **Partial** |
| #12 | Rider GPS tracking | **Done** | `/api/riders/location` validates finite/in-range coords + accuracy + **active duty session** + own identity; `RiderProfile.currentAccuracy`; `RiderLocationTracker` (watchPosition, throttled, graceful deny) mounted for riders. e2e 25 (valid/invalid/off-duty/role) |
| #21 | Customer GPS | **Done (API) / Partial (prompt UI)** | `/api/customer/location` validates + stores `User.current{Lat,Lng,Accuracy}`, kept separate from addresses. e2e 25. Friendly permission-prompt UI: **Partial** |
| #20 | Customer nearest branch | **Partial** | `nearestEligibleBranch()` computes nearest COVERED active/non-archived branch server-side from trusted GPS/default-address coords; `/api/customer/nearest-branch` returns eligible/disabled flags (e2e 25). NOT yet wired: forcing the order's branch to the server-nearest (createOrder still accepts a coverage-validated client branch_id) + disabling non-nearest in the customer branches UI |
| #11 | Rider online visibility | **Done** | `/api/riders/branch` derives online from the **active duty session at the branch** (not the stale flag); returns on_duty_since + last_ping. e2e 25 |
| #6 | Rider blocking new-order popup | **Done (server) / Built (UI, not E2E-verified)** | `RiderOrderAssignment` offer created on assign (+distance); `/api/rider/assignments/pending`; `respondToAssignment` accept/reject; blocking `RiderAssignmentGate` modal (5s poll, no outside/Escape dismiss, focus trap, WebAudio beep + visual, map/fallback) mounted for riders. e2e 25 (server accept/reject/idempotent/cross-rider 403). The modal's blocking UX itself is not yet covered by an E2E test |
| #7/#14 | Rider acceptance details | **Done** | Assignment status/accepting-rider/distance/responded-at serialized on the order (`assignment` field) from the DB — never UI-inferred. e2e 25 (BM reads acceptance) |
| #8/#16 | Pickup verification | **Done** | `verifyPickupByOrderNumber` — validates order-number → assigned rider → active branch session → delegates to `confirmReceive` (state/idempotency). e2e 25 (wrong number 404, cross-rider 403) |
| #19 | Customer dashboard Order entry | **Done** | Dashboard "Order" button → homepage menu experience |
| #10 | Cart / checkout | **Pending** | Order-flow specs (04) pass and the order API works end-to-end incl. new snapshots; no reproducible cart break was found. A dedicated full login→menu→cart→checkout→confirmation E2E + the checkout area/charge selector UI remain to be added |
| #3 (prompt) | Category dropdown dark-mode | **Pending (re-verify)** | Not re-audited this round |
| CSV import | Delivery-area CSV | **Pending (no file)** | No `*.csv` exists inside the project; import is report-only per spec — not fabricated |

RBAC/IDOR verified at the API layer for every new surface (delivery-area
cross-branch 403, branch-archive non-SA 403, address IDOR 403/404, rider-location
role 403 + off-duty 409, cross-rider assignment 403, pickup cross-rider 403).
EN + BN parity maintained (2515 keys each, 0 mismatches).

## Round 3 — verification addendum

- **Regression found + fixed (not a weakening):** `17-rider-dashboard.spec.ts:159`
  drove an assigned order from the rider dashboard using the internal id `#<id>`
  and assumed no assignment popup. Under the new behavior the order shows its
  unique number `ORD-…` (#15) and the blocking assignment popup (#6) appears
  first. Fixed the two rider dashboard components to display the order number
  (`rider-current-order`, `rider-pending-orders`) and updated the test to accept
  the assignment (the required new step) and match by order number. Confirmed
  green in isolation.
- **Visual snapshots (Linux baselines added after inspection):** generated
  `-chromium-linux.png` baselines for specs 17/18/19 and **visually inspected**
  them against the darwin baselines + intended design — product-modal, homepage,
  and rider-offline dashboard render identically in structure/content (only
  platform font-antialiasing differs, which is exactly why cross-platform pixel
  baselines diverge). Baselines committed only after that inspection; darwin
  baselines are retained (Playwright selects per-platform). `--ignore-snapshots`
  was NOT used.
- **Full suite:** re-run after the fixes + baselines (result recorded in the
  final report).
- **`01-public-auth logout` is a pre-existing timing flake, not a regression:**
  across full-suite runs it failed intermittently for `customer` on one run and
  for BOTH `customer` and `super_admin` on another. The logout code path was not
  touched this round; a flake that hits `super_admin` (never modified) proves it
  is environmental/timing, not caused by these features. As a defensive perf
  improvement the customer dashboard "Order" button no longer prefetches the
  heavy homepage (`ButtonLink prefetch={false}`). The test itself was NOT
  weakened, skipped, or retried-to-hide.
- **Visual baselines regenerated in the full-suite context:** the rider-offline
  screenshot is data-dependent (earnings/wallet/notifications accumulate from
  earlier specs). Baselines were regenerated during a full `--update-snapshots`
  run so they capture the same in-context state the suite exercises, then a
  clean confirming run was executed (result in the final report).

---

## Round 4 — release-readiness completion

This round completes the remaining customer-facing delivery flow and — importantly — **replaces the earlier "logout is a pre-existing timing flake" conclusion with the real, fixed root cause.**

### Task 8 — logout failure: REAL root cause found and fixed (not a flake)
- **Reproduced** deterministically with a network-capturing diagnostic spec (6 iterations). Every logout `signOut()` correctly emitted `Set-Cookie: authjs.session-token=; Max-Age=0`, yet the cookie **reappeared** and the session survived.
- **Root cause:** the Auth.js `auth()` route middleware (`proxy.ts`) **re-issues (rolls) the session cookie on every request it handles**. When the customer clicks Logout, the dashboard has already *viewport-prefetched* its nav links, so RSC prefetch requests to protected routes are in flight; each reaches the server a beat later still carrying the valid JWT, and `auth()` rolls a fresh `Set-Cookie` onto its response — **resurrecting the just-cleared session**. This is a genuine auth defect (logout did not actually log the browser out), intermittent because it depended on prefetch timing — which is exactly why it also hit `super_admin`.
- **Fix:** `proxy.ts` is now **read-only with respect to the session cookie** — it strips any `Set-Cookie` the wrapper would roll. The session cookie is legitimately written exactly twice in the app's life: set by the `signIn` action, cleared by the `signOut` action — never by middleware. Route protection is unchanged (`requireRole` + every API handler still enforce auth).
- **Verification:** diagnostic → single `Max-Age=0`, no resurrection, `SURVIVING: []` across 6/6 iterations; `01-public-auth.spec.ts --repeat-each=4` → **72/72 passed (8 logout runs: customer×4 + super_admin×4)**. The earlier `ButtonLink prefetch={false}` note is superseded by this real fix; the `expect.poll` in the logout helper remains only as a benign jar-commit synchronization.
- Also hardened the test harness: `playwright.config.ts` pins `AUTH_URL`/`NEXTAUTH_URL` to the test origin (the deploy `.env` carries a production `AUTH_URL` that would otherwise force cross-origin redirects) and sets `LD_LIBRARY_PATH` for the `sharp` libvips so `npm run test:e2e` is self-sufficient.

### Task 1 — customer address management (Done)
`components/customer/address-manager.tsx` extended to full CRUD with label presets (Home/Office/Second Home/Others + custom label), area, delivery instructions, optional lat/lng, and default-address handling. `noValidate` + inline red field-level validation with translated messages; responsive; EN/BN; keyboard accessible; sidebar entry already present.

### Task 2 — customer GPS permission/status UI (Done)
`components/customer/location-permission-card.tsx` — explains the use, requests the Geolocation API, handles granted/denied/unavailable/timeout/low-accuracy/unsupported with a retry, and saves via `POST /api/customer/location`. Kept **separate** from saved addresses (new `customerLocationStatus` service reads `currentLat/Lng/Accuracy/updatedAt`); never overwrites the default address.

### Task 3 — nearest branch enforced server-side in order creation (Done)
`resolveDeliveryBranch()` (+ shared `resolveBranchForCart`) derives the delivery branch **server-side from the cart's products + trusted coordinates, ignoring any client `branch_id`**. Excludes archived/inactive/uncovered branches and product-mismatch carts; deterministic id tiebreak; translated `errors.orders.noEligibleBranch` when none qualifies. Pickup keeps the explicit branch. Verified by spec 26 (branch-spoof ignored, no-eligible, missing-coords, cross-branch, archived, inactive, pickup).

### Task 4 — customer branch UI (Done)
`app/(dashboard)/customer/branches/page.tsx` enables **only** the nearest eligible branch (green, clickable link → menu); every other branch renders disabled (`pointer-events-none`, `tabIndex={-1}`, `aria-disabled`) with a translated explanation. Empty/no-location states link to set location. Uses the `nearestEligibleBranch` service.

### Task 5+6 — cart/checkout deep-trace + delivery-area selector + server summary (Done)
- **Trace result:** cart already dedupes lines by `productId:variationId`; the cart is cleared **only after a confirmed successful order** and a failed order leaves it intact (both now covered by UI tests). No client-total trust.
- **New:** `quoteOrder()` service + `POST /api/delivery/quote` return a fully server-derived summary (subtotal, delivery charge, prep time, delivery estimate, overall estimate, total) using the SAME branch/area/pricing rules as `createOrder` (shared `resolveVariationFor`/`discountedUnit` so preview and persisted order can never disagree). Checkout form adds a **delivery-area selector** (held areas disabled with reason) and renders the server summary (address/branch/area/charge/prep/delivery-time/overall-estimate/subtotal/total). `GET /api/branches/[id]/delivery-areas` lists a branch's active areas; seeded areas added (Gulshan, Banani active; Uttara held).

### Task 7 — category dropdown light/dark (Done)
Fix lives in the shared `Select` (`components/ui/input.tsx`) — themed field surface + `[&>option]:bg-surface-card [&>option]:text-fg-base` so native options stay readable in dark mode; no page-specific style. Regression test: `tests/e2e/27-category-dropdown.spec.ts`.

### Task 9 — E2E coverage (Done)
`tests/e2e/26-nearest-branch-checkout.spec.ts` (16 tests): branch-spoof ignored, no-eligible-branch, missing-coords, product-mismatch, archived + inactive exclusion, pickup keeps branch; server quote (charge/estimate/total) + held-area block at quote and order; nearest-branch API ownership (customer-only) + eligibility map; GPS save self-only + coordinate validation; address IDOR; full UI checkout journey (browse nearest → add → coverage → area → place order, exactly one order created); failed order leaves cart intact + identical-add dedupe; Bangla checkout render.

### Task 10 — CSV delivery-area import (Pending — file absent)
`All Info Cheez - Day Location.csv` is **not present anywhere inside the project** (verified via `find`). Per the task's own condition, the importer was not built. If the file is added to the repo, a one-shot importer + admin action can map rows → `BranchDeliveryArea`.

### Verification (this round)
`prisma format` ✔ · `prisma validate` ✔ (valid) · `prisma generate` ✔ · `prisma migrate status` ✔ (17 migrations, up to date, none pending — Round-4 changes are data-only) · `npm run seed` ✔ · `npm run lint` ✔ (0 errors; PM2 `ecosystem.config.cjs` excluded as non-source ops config) · `npm run build` ✔ · targeted suites: `01×4` 72/72, order specs (04/20/21/24/25) 38/38, spec 26+27 16/16. Full-suite result recorded in the final report.

### Full-suite stabilization (real fixes, no masking) → 336/336
The first full-suite runs surfaced pre-existing full-suite-context fragility (prior sessions saw 1–8 similar failures). Each was root-caused and fixed:
- **Rider dashboard horizontal overflow at mobile (15/16/17):** the rider dashboard grid (`xl:grid-cols-[290px_1fr_310px]`) columns lacked `min-w-0`, so on mobile (single-column, 347px track) a grid item overflowed its track whenever a card's content min-width was large — triggered here by long branch names in data. Added `min-w-0` to the three grid columns (canonical grid-item-overflow fix); also capped the online-panel branch `<select>` with `max-w-full min-w-0` and added `break-words`/`break-all` to the assignment modal's address/order-number. A DOM diagnostic confirmed `documentElement.scrollWidth == clientWidth` (no overflow) after the fix.
- **Login `page.click` timeout (hydration race):** the login submit button is disabled until the controlled inputs are valid; a `fill()` before React hydrates is dropped, leaving the button stuck disabled under load. The shared `login()` helper now re-applies the values until React registers them (a hydration sync — real UI/button/redirect, no product change).
- **Spec 22 login-under-load (passed 8/8 in isolation, flaked at ~min 15 of the full run):** added a headless `apiLogin` (Auth.js credentials callback, no page load) and switched the API-only `readyOrder` helper to it, removing the heaviest UI-login load from the flaky path.
- **`retries` stays 0 locally** (no retry-masking); the 336/336 result is a single clean pass.

**Final verification:** `npm run lint` ✔ 0 · `npm run build` ✔ · `npm run seed` ✔ · `npm run test:e2e` (full, `E2E_PORT`, one worker, retries 0) → **336 passed, 0 failed, 0 skipped, 0 flaky (15.9m)**. `yarn build` also verified green with `LD_LIBRARY_PATH` unset (scripts self-provide the libvips path).

### Production incident + recovery (live-site "Something went wrong")
Reported: every page showed the error boundary in production. Root cause was a **process problem, not a code bug**:
- An **orphaned `next start`** (pid 923180, PPID=1, from the Round 3 deploy) still held `127.0.0.1:3200`, so the PM2-managed `mad-delivery-hq` (id 13) could never bind — it was **crash-looping on `EADDRINUSE` (↺ 8969)**.
- The orphan had loaded an older `.next`; subsequent Round 4 rebuilds overwrote that shared `.next` under it, so its client chunks no longer matched → browser hydration threw → the client error boundary took over the page (the SSR HTML itself still contained real content).
- The self-fetch was NOT the cause: the live `/api/branches` endpoint returned clean JSON with a valid, publicly-trusted certificate.

Recovery (explicitly authorized by the user — "Fix now"): killed the orphan, `pm2 restart mad-delivery-hq`, `pm2 save`; removed one stray leftover E2E server (port 3922). Result: PM2 `mad-delivery-hq` **online, ↺ 0, stable**; public homepage 200 with full content; `/api/delivery/quote` returns 401 (route exists → the current release-ready Round 4 build is now live). Note: because the shared `.next` was overwritten during Round 4, production now runs the Round 4 build (there was no separate Round 3 build left to restore).

Prevention for next time: give production its own checkout/`.next` (don't share the build dir with the dev/E2E build), and ensure only PM2 owns port 3200 (no manual `next start` left detached).

---

## Round 5 — catalog governance, variation type, visibility & search

### Test-database isolation (safety prerequisite)
`.env` points `DATABASE_URL` at `dev.db`, which the deployed server also uses — running Playwright against it mutated live data. `playwright.config.ts` now pins the E2E server to its own `file:./test.db` (override: `E2E_DATABASE_URL`), with `npm run db:test:deploy`, `npm run seed:test` and `npm run test:e2e:prepare` to migrate/seed it. The development/production database is never touched by tests, and no migration was applied to it.

### REQ #1 — Super Admin branch delete/archive — **Done**
Backend `archiveOrDeleteBranch` already hard-deleted unused branches and archived used ones; the dependency count was **extended from 12 to all 30 branch-referencing models** (complaints, adjustments, activity logs, attendance, time slots, duty logs/chats, order assignments, receive confirmations, manager assignments, every Ramadan table, zones…). This matters because several relations cascade on branch delete — an uncounted dependency would have silently destroyed history. UI: `BranchActions` (detail) + new `BranchRowDelete` (each list row); the dialog now names the **exact branch** and warns the operation may ARCHIVE rather than delete; `deleteBranchAction` redirects with the real outcome (`?result=deleted|archived`). `serializeBranch` now exposes `is_archived`/`archived_at`. Tests: unused→deleted, used→archived + history preserved, archived hidden from customers, 6 roles × 403, dialog content + real outcome.

### REQ #2 / #3 — Category delete + activate/deactivate — **Done**
`deleteCategory` (deactivate when products exist, else hard delete) and super-admin RBAC already existed. Added `setCategoryActive` with **audit fields** (`statusChangedById`, `statusChangedAt`) and a **409 conflict on a repeated transition**, `POST /api/categories/[id]/status`, `setCategoryActiveAction`, and a `CategoryActions` component on the admin list: delete dialog names the category **and its scope** and states up front whether the result is deletion or deactivation. Tests: unused→deleted, used→deactivated with product + row preserved, 409 duplicate transition, 5 roles × 403 on create/edit/status/delete, deactivated category hidden from catalogue **and search**, dialog copy.

### REQ #4 — Product variation type — **Done**
No Prisma enums exist in this schema (all enum-like values are validated Strings), so `Product.variationType` follows that convention with `PRODUCT_VARIATION_TYPES` + `isProductVariationType()`. `OrderItem.variationType` stores an **immutable snapshot**. Migration `20260721090524_add_product_variation_type_and_category_status_audit` is additive and includes a documented **backfill** inferring the crust from existing `ProductVariation.variantType`/name/sizeLabel, defaulting to `THICK` (a single fixed crust introduces no new mandatory choice on legacy data); no variation rows are touched. Mandatory dropdown on the shared product form (BM + SA), preserved on edit (an absent field never erases it). Customer card shows a crust chooser for `BOTH` (blocked until chosen) and a fixed label otherwise; **crust is part of the cart line identity** so Thick and Thin never merge. Server re-validates every choice (`resolveCrustChoice`) in both `createOrder` and `quoteOrder`. Tests: create THICK/THIN/BOTH, persistence on edit, invalid value rejected, cross-branch edit 403, forged crust rejected, BOTH requires a choice, snapshot immutable after the product changes, UI gating + separate cart lines.

### REQ #5 — Branch Manager dashboard branch info — **Done**
The dashboard API returned only `{id,name,address,is_active}`. It now also returns `brand_type` (from the existing `Branch.brandType`), `is_archived` and an active `delivery_area_count`, all resolved from the **authenticated manager's assignment** — a forged `branch_id`/`branch` query param is ignored. The dashboard renders a branch-identity card (name / type badge / status / area count) with an existing empty state when no branch is assigned. Tests: correct name+type, cross-branch isolation against forged params.

### REQ #6 — Branch Manager delivery-area module — **Done (verified + tested)**
The module already existed (sidebar entry, page, `DeliveryAreasManager`, full service + APIs, BM branch forced from the assignment). Verified and covered by tests: own-branch list, add (submitted `branch_id` ignored), edit name/time/charge, hold→resume, deactivate→reactivate, normalized duplicate rejected, cross-branch 403, page reachable, and **existing order snapshots unchanged** after the area's charge/time are edited.

### REQ #7 / #10 — Nearest branch + delivery-area validation — **Done (verified + tested)**
Implemented in Round 4 (`resolveDeliveryBranch`, `nearestEligibleBranch`, `resolveOrderDeliveryArea`, server-derived quote). Re-verified here: deterministic nearest result, exactly one eligible branch, foreign-branch area rejected, outside-coverage rejected, invalid coordinates rejected, and charge/time snapshots immutable.

### REQ #8 — Demo branches removed — **Done**
The public homepage rendered **10 hardcoded demo branches** (`lib/home/branches-data.ts`) with invented addresses/coverage plus name-keyed opening hours, a `CLOUD_ONLY`/`LATE_NIGHT` name list in `BranchesCoverage`, hardcoded branch-name schedules in `OperatingHours`, a hardcoded "10 branches" count and branch names inside a translation string. All removed: `branches-data.ts` is **deleted**; both components are now driven by the new `publicHomeBranches()` selector (active, non-archived branches + their active delivery areas), hours come from each branch's `openingTime`/`closingTime`, late-night from its brand type, and the count is `branches.length`. When the database returns nothing the section renders an **empty state** — never fabricated data. No live rows were deleted.

### REQ #9 — Active branch / category / product visibility — **Done**
`productsForUser` (customer) previously missed `branch.isArchived`, ignored category status and did not require a purchasable variation. It now requires: available, not held, not soft-deleted, branch **active AND non-archived**, category **active or absent**, and **at least one enabled variation**. `categoriesForUser` now also requires a branch-scoped category's branch to be active and non-archived. Enforcement lives in the selectors, so direct API access cannot bypass it. Tests: product under a deactivated category hidden, soft-deleted product hidden, inactive branch hidden, historical order still readable.

### REQ #11 — Branch/catalogue search — **Done (root cause fixed)**
**Root cause:** there was no branch search at all — `/api/branches` never read a search param and the customer branches page had no input; separately the customer menu page sent `branch`, `category` and `search` to `/api/products` and `/api/categories`, which read **only** `branch_id`, so its search box did nothing and results were not branch-scoped. Fixed by adding a trimmed, case-insensitive server-side search to `/api/branches` (matching name, address and **active delivery-area names**), honouring `search`/`category`/the `branch` alias in the products and categories APIs, and adding a GET search form to the customer branches page with a translated no-results state and a clear action. Search filters only — eligibility is computed independently, so it can never re-enable a non-nearest branch or surface an inactive/archived one. `ButtonLink` now forwards extra props (it silently dropped `data-testid`). Tests: exact/partial/case-insensitive/whitespace queries, delivery-area query, no-results empty (no fallback), inactive branch not searchable, UI filter + clear with exactly one enabled branch, branch-scoped product search.

### Verification (this round)
`prisma format` ✔ · `prisma validate` ✔ · `prisma generate` ✔ · migration applied to the **isolated test DB only** · `npm run seed`/`seed:test` ✔ · `npm run lint` ✔ **0 errors, 0 warnings** · `npm run build` ✔ · targeted specs 28 (16/16) and 29 (16/16). Full-suite result recorded in the final report.

### Round 5 — regressions found by the full suite, and how they were fixed
The first full-suite run after these changes reported 31 failures. All were caused by this round's own work, and each was fixed at the source rather than by weakening a test:

1. **Seeded pizza became a `BOTH` product (26 failures).** Making the crust choice mandatory for `BOTH` meant every pre-existing spec that ordered the seeded "Cheese Pizza" got `400`. Shared seed fixtures must not impose a new mandatory customer choice, so all seeded products are now `THICK`; the `BOTH` path is exercised by purpose-built products created inside spec 29.
2. **Homepage visual baselines (3 failures).** The homepage legitimately changed — real database branches replaced the 10 hardcoded demo ones. Baselines were regenerated with `--update-snapshots` (never `--ignore-snapshots`), and spec 18 then passed 18/18.
3. **`variation_type` required on create broke pre-existing API callers (6 failures).** The requirement puts "mandatory" on the create/edit *forms* (which always submit a value) and its backward-compatibility section asks for a documented safe default. The server therefore falls back to `PRODUCT_VARIATION_TYPE_DEFAULT` ("THICK") when the field is absent, while still rejecting any invalid value that IS supplied. Old clients keep working; forged values are still refused.

The isolated `test.db` is recreated (delete + `migrate deploy` + seed) before the authoritative run so results are deterministic and free of accumulated test data. `prisma migrate reset` was never used, and no non-test database was reset or migrated.

### Round 5 — final verification
`npx prisma format` ✔ · `npx prisma validate` ✔ valid · `npx prisma generate` ✔ · `npx prisma migrate status`: **test DB** 18/18 applied, up to date; **development/production DB deliberately NOT migrated** (production migration is out of scope) · `npm run seed` / `seed:test` ✔ · `npm run lint` ✔ **0 errors, 0 warnings** · `npm run build` ✔ · **`npm run test:e2e` → 368 passed, 0 failed, 0 skipped, 0 flaky (19.6m)** against the isolated `test.db`, `retries: 0`, one worker.

**Deploy prerequisite (owner action):** `Product.variationType`, `OrderItem.variationType` and the Category audit columns exist only in the test database. The migration `20260721090524_add_product_variation_type_and_category_status_audit` MUST be applied to the production database before this build is deployed/restarted, or the new code will query columns that do not exist. Note also that the dev/E2E build shares the `.next` directory with the running PM2 process.

---

## Round 6 — 2026-07-22 — production error root cause, date/time, theming, radius/fee, phone search

### PHASE 9 + PHASE 16 — every reported data-loading error — **Done (root cause)**
All six reported refs shared ONE cause, proven not guessed:

```
The column `main.Product.variationType` does not exist in the current database.
```

The Round-5 migration (`Product.variationType`, `OrderItem.variationType`, Category status-audit columns) had been applied to the **test** database only, while the running build SELECTed those columns from `dev.db`. Every page that reads products, categories, orders or order items therefore threw, surfacing as the generic boundary:

| Ref | Page | Cause |
|---|---|---|
| 1785202134 | Super Admin dashboard | reads orders/products |
| 2332199718 | Products | `product.findMany` |
| 2088603668 | Categories | `category.findMany` |
| 1660125826 | Orders | order + items |
| 1544635164 | Reports | orders/products aggregates |
| 4160909269 | BM Catalog | products + categories |

**Fix:** backed up `dev.db`, then applied the additive migration to it. Row counts identical before/after (Product 40, Category 43, Order 126, OrderItem 128, Branch 22, User 17) and the documented backfill inferred one `BOTH` product from existing crust data. Verified the previously-failing SELECTs now succeed and the live endpoints return 401 (auth) instead of 500. No data was reset, truncated or recreated.

**Regression cover:** `tests/e2e/30-data-loading-regressions.spec.ts` (12 tests) asserts each page loads real data with no boundary text, the APIs return arrays, order items expose the snapshot column, an EMPTY dataset renders an empty state (not an error), unauthorized roles still get 403, and a **schema-drift guard** queries every core model so this class of failure fails loudly in CI instead of in production.

### PHASE 8 — date/time + moving icon — **Done**
`lib/i18n/format.ts` had no `timeZone`, so dates rendered in whatever zone the server/browser used (wrong times, and an SSR/client hydration mismatch risk). All formatters now pin `APP_TIME_ZONE = "Asia/Dhaka"` with explicit `hour12`, and the live status-bar clock uses the **application** locale (`bn-BD` / `en-GB`) rather than browser defaults. The unwanted moving icon was the `.route-rider` bike gliding along the header rail — the element, its `route-ride` keyframes and its CSS class are removed; the rail remains as a static separator and the live-status dot is kept deliberately. Tests: English stamp, Bangla stamp, language switch, clock stays on Dhaka time even in an `America/New_York` browser, and no travelling animation remains.

### PHASE 14 (+ systemic PHASE 2) — dropdown/theme colours — **Done**
The Notice Audience control was a **raw `<select>`** styled by a hand-rolled `field` class that omitted `bg-surface-card`/`text-fg-base`, so its native option list was unreadable in dark mode. Rather than patch one form: the shared field styling is now exported as `FIELD_CLASS`, the seven files that hand-rolled a `field` class now consume it, and **all 18 raw `<select>` elements across 8 files** were converted to the shared themed `Select` (which forces `[&>option]` colours). Tests assert the audience control carries the themed classes in light **and** dark, that its text never equals its background, and that no control on the audited pages renders with a transparent background.

### PHASE 10 — customer search by phone — **Done**
Search existed but matched phones with a naive `contains`, so `+880…`/`880…` forms missed. Added `normalizeBdPhoneForSearch()` + `looksLikePhoneQuery()`: a phone-shaped query is reduced to its national significant digits (country code and trunk `0` stripped, separators removed) and matched against the stored local form. Server-side, paginated, super-admin-only. Tests cover exact/`+880`/`880`/spaced-and-dashed/partial forms all finding the same customer, a non-matching number returning empty (no match-all), pagination, and 403 for other roles.

### PHASE 11 — delivery radius + fee — **Done**
Added `Branch.deliveryFee` plus immutable `Order.deliveryDistanceKm` / `Order.deliveryRadiusKmSnapshot`. New service `updateBranchDeliverySettings` + `PATCH /api/branches/[id]/delivery-settings`: **super admin any branch, branch manager only their own** (the id is resolved against the assignment, so a forged id is refused). Validation is Decimal-safe and rejects NaN/Infinity/negative/zero-radius/over-precision, with a business maximum. The delivery charge is server-derived — a named area supplies its own charge, otherwise the branch fee applies, pickup is free — and radius enforcement continues through the existing coverage check. Tests: SA update, BM own-branch update, cross-branch 403, four other roles 403, seven invalid values rejected, inside-radius order charged the branch fee with distance/radius snapshotted, later fee/radius edits leaving the existing order unchanged, and an outside-radius order rejected.

### PHASE 15 — branch identity — **Done**
The BM dashboard identity card now shows outlet name, brand type (CHEEZ / MADCHEF / COMBINED via the existing enum + translated labels), active/archived status, delivery-area count, **delivery radius and delivery fee** — all from the authenticated manager's own assignment, with forged `branch_id` query params ignored.

### Verification (this round)
`prisma format` ✔ · `prisma validate` ✔ · `prisma generate` ✔ · migration `20260722094516_add_branch_delivery_fee_and_order_radius_snapshots` applied to **test and development** databases (additive; production deployment untouched) · `npm run lint` ✔ 0 errors 0 warnings · `npm run build` ✔ · targeted specs: 30 → 12/12, 31 → 8/8, 32 → 11/11. EN/BN parity 2627 = 2627, 0 mismatches.

### Round 6 — full-suite verification + one self-inflicted regression fixed
The first full run after these changes reported **1 failure**: the rider offline-dashboard screenshot grew 100px taller. Root cause was mine — the shared themed `Select` carries `w-full` by design, and `cn()` is a plain class join (no tailwind-merge), so converting the rider branch `<select>` made it full-width and wrapped that flex panel onto an extra row. Fixed by bounding the control in a fixed-basis wrapper, which restored the original layout — the **existing baseline then matched**, so no snapshot was regenerated (proving the design was restored, not a regression accepted).

**Final:** `prisma format` ✔ · `prisma validate` ✔ (valid) · `prisma generate` ✔ · `prisma migrate status`: 19 migrations, **test and development databases both up to date** · `npm run lint` ✔ 0 errors 0 warnings · `npm run build` ✔ · **`npm run test:e2e` → 399 passed, 0 failed, 0 skipped, 0 flaky (20.1m)** on the isolated `test.db`, one worker, `retries: 0`.

### Round 6 — NOT implemented (honest status)
The following phases from this round's brief were **not** started and remain **Pending**; nothing was stubbed or faked to appear complete: P1 design-system audit, P3 SEO/metadata, P4 performance, P5+P17 live polling, P6 post-login GPS prompts, P7 map UI, P12+P13 reward activation/earning rules/point value, P18 order-workflow state machine, P19 table-layout chairs, P20 Ramadan platter view/edit/delete, P21 employee roles/teams/status, P22 staff attendance, P23–P26 customer login redirect / out-of-zone page / nearest-branch ordering investigation / expanded delivery validation, and P27 COD + manual bKash payments.

---

## Round 7 — 2026-07-22 — rewards switch, payments, order-workflow audit

### PHASE G — reward programme activation/deactivation — **Done**
- **Files:** `lib/services/rewards.ts`, `app/api/admin/rewards/status/route.ts`, `app/api/admin/rewards/route.ts`, `app/api/customer/rewards/route.ts`, `components/admin/reward-program-toggle.tsx`, `lib/api/actions.ts`, admin rewards page.
- **Schema:** none — the switch reuses the existing `SystemSetting` table (`reward_program_active`), which already records actor + timestamp. No second reward engine was created.
- **Service/API:** `rewardProgramActive()` / `setRewardProgramActive()`; `POST /api/admin/rewards/status`. Both reward APIs now expose `program_active`.
- **RBAC:** super-admin only, enforced in the service; repeating the current state returns **409**.
- **Behaviour:** while paused, `awardCoins` awards nothing and `redeemCoins` refuses — balances and the whole ledger are untouched and become usable again on re-activation.
- **UI:** status badge + confirmed pause / direct activate + a plain "rewards are paused" notice. **EN/BN** added.
- **Tests:** `tests/e2e/33-reward-program.spec.ts` — **5/5** (pause+reactivate persistence, 409 duplicates, 6 roles refused, redemption blocked with balance/history preserved, UI states).

### PHASE S — Cash on Delivery + manual bKash — **Done**
- **Files:** `lib/services/payments.ts`, `app/api/orders/[id]/payment/route.ts`, `app/api/orders/[id]/payment/verify/route.ts`, `app/api/branches/[id]/payment-settings/route.ts`, serializers.
- **Schema:** `Branch.bkashEnabled`, `Branch.bkashInstructions`; `Order.paymentStatus`, `bkashTransactionId`, `bkashPayerPhone`, `bkashDestinationNumber`, `paymentSubmittedAt`, `paymentVerifiedById`, `paymentVerifiedAt`, `paymentRejectionReason`, plus an index on `bkashTransactionId`.
- **Behaviour:** COD stays `unpaid` and is never auto-settled. Manual bKash → `pending_verification`, never auto-paid; the branch's number is **snapshotted** onto the order so later branch edits cannot rewrite what the customer was told. Duplicate transaction ids are refused across all orders (409). No automated gateway is claimed.
- **RBAC:** customers submit only for their own order (403 otherwise); accounts/super-admin or the **own-branch** manager verify; re-deciding a settled payment returns 409 so the audit cannot be overwritten; rejection requires a reason stored verbatim. Branch settings: SA any branch, BM own only; bKash cannot be enabled without a valid BD number.
- **EN/BN** added for every label, status and error. **Tests:** `tests/e2e/34-payments-cod-bkash.spec.ts` — **13/13**.

### PHASE J — Branch Manager order workflow — **Done**
- **Files:** `lib/services/orders.ts`, `app/api/orders/[id]/update-status/route.ts`, `lib/selectors/index.ts`, `lib/serializers/index.ts`.
- **Schema:** new `OrderStatusEvent` model — append-only per-transition audit (from/to status, actor, reason, timestamp), written in the **same transaction** as the status change so history can never drift from state.
- **Contract change:** an illegal transition is now **409** (a state conflict) instead of 400, as specified. The one existing assertion that expected 400 for a re-delivered order was updated to 409 — it still asserts the transition is refused.
- **Rejection reason:** required when a **branch manager** cancels/rejects (a super-admin administrative cancellation is not forced), stored exactly as typed. Three existing specs that cancelled as BM now supply the reason.
- **Tests:** `tests/e2e/35-order-workflow.spec.ts` — **8/8** (full happy path incl. receive-confirmation gating, skip-ahead/backwards/re-finalise all 409, reason required + verbatim, actor/from/to recorded, cross-branch 403, role restrictions).

### Database
Migrations `20260722105246_add_payment_verification_and_branch_bkash` and `20260722_add_order_status_event_history` (plus the earlier `..._add_branch_delivery_fee_and_order_radius_snapshots`) are additive and data-preserving. Applied to the isolated test DB, then to `dev.db` after a timestamped project-local backup (`prisma/dev.db.backup-20260722-110425`); row counts identical before/after — Product 40, Category 43, Order 126, OrderItem 128, Branch 22, User 17, RewardLedger 17. No production deployment, no reset, no seed against live data.

### PHASE H — reward earning rules and point value — **Done**
- **Schema:** new `RewardEarningRule` (name, description, active/archived, fixed points, points-per-currency, minimum order, eligible order + payment status, start/end dates, priority, optional branch scope, created/updated actor + timestamps) and `RewardLedger.ruleId` (nullable, `SetNull`) so history keeps pointing at the rule that produced it.
- **Money:** point arithmetic runs in integer space (poisha × milli-rate ÷ 100 000), so a 0.1/৳ rate can never drift into a floating-point remainder.
- **Rules enforced:** no negative values; a rule that awards nothing at all is refused; end date must follow start; the branch must exist. Two ACTIVE rules that could claim the same order at the same priority are **refused with 409** — ambiguity is resolved by explicit priority or rejected, never guessed.
- **History:** editing a rule affects future awards only (the coins and rule id are frozen into the ledger row); a rule that has paid out is **archived, not deleted**, and archived rules are read-only (409).
- **Coexistence:** the three fixed system rules (profile complete, daily login, order delivered) are untouched. A delivered order is priced by the best-matching earning rule; with no match the legacy flat amount still applies, so nothing that worked before stops working.
- **API/UI:** `/api/admin/reward-rules` (+ `/[id]`), super-admin only; full list/create/view/edit/activate/deactivate/safe-delete UI on `/admin/rewards`. **EN/BN** complete. **Tests:** `36-reward-earning-rules.spec.ts` — **7/7**.

### PHASE M/N — employees, teams, job terms, Quit Job, attendance — **Done**
- **Schema:** new `EmployeeTeam` (branch-scoped, unique name per branch, active + archived); `BranchEmployee.customRole`, `.employmentStatus`, `.quitAt`, `.quitReason`, `.teamId`.
- **Job terms:** `others` joins the existing validated roles rather than replacing them, and REQUIRES a custom label — switching back to a real role clears the stale label so it cannot linger.
- **Quit Job:** a status change, never a delete. The employee row, their attendance and every report survive; the only behavioural change is removal from the roster used to create NEW attendance (`?roster=true`). A quit employee's EXISTING attendance rows stay editable so past records can be corrected. Quitting requires a reason; repeating a status returns 409.
- **Teams:** branch-scoped end to end — a manager cannot read, edit, delete or assign into another branch's team (403/400). A team with members is archived rather than deleted. A role with no team scope is **refused (403)** rather than handed an empty list, which would read as "no teams" instead of "not yours".
- **Filters:** search, role, team, employment status and pagination are real queries; `All` is a filter value only and is never stored. Attendance gained a `team_id` filter and deliberately does NOT filter on employment status, so history stays visible.
- **EN/BN** complete; UI on the BM employees page (teams panel + employee panel). **Tests:** `37-employee-teams-status.spec.ts` — **7/7**.

### PHASE L — Ramadan platter View / Edit / Delete — **Done**
- **Schema:** `RamadanMenu.isArchived`.
- Added the missing **GET one platter** (View) behind the same branch guard as the mutations. A platter with reservations is **archived + deactivated** instead of deleted; the response says which happened. Archived platters are hidden from the default list, retrievable with `include_archived=true`, invisible to customers, and read-only (409).
- Reservation snapshots were already immutable and remain so — the test books a platter, archives it, and asserts the reservation's price and name are unchanged.
- **Cross-branch:** view/edit/delete of another branch's platter is 403 for a manager and for every non-managing role. **Tests:** `38-ramadan-platter-actions.spec.ts` — **4/4**.
- **Bug found and fixed on the way:** a reservation posted without `slot_id`/`table_id`/`menu_id` reached Prisma as `NaN` and returned **500**. Missing ids are now field errors (400).

### PHASE I + D — Branch Manager live dashboard and targeted refresh — **Done**
- **New:** `lib/services/branch-live.ts` + `GET /api/dashboard/branch-manager/live`. Real counts only: per-status orders for today, rider-assigned, riders online (open duty sessions at this branch), active/quit staff, today's attendance by status, delivery areas total/held/inactive, bKash awaiting verification, unread notifications.
- **Branch spoofing is impossible by construction** — the endpoint takes no branch parameter at all; the branch comes from the authenticated manager. A missing or archived branch returns an explicit empty snapshot instead of crashing.
- **`lib/hooks/use-live-data.ts`** — polls one endpoint and swaps the data in place: **no `router.refresh()`, no page reload**. Overlapping requests are impossible (a tick is skipped while one is in flight), a failed tick keeps the last good data and shows a "reconnecting" note, and polling pauses while the tab is hidden.
- **Tests:** `39-bm-live-dashboard.spec.ts` — **5/5**, including a test that pins a value into `window`, places an order, waits for the tile to change, and asserts the pinned value survived — which a full reload would have destroyed.

### PHASE K — table layout chairs — **Done**
- **New:** `components/branch/table-node.tsx`. Chairs are dealt round-robin to the four sides and placed at `(k+1)/(m+1)` along each side, so 2/4/6/8 and any other capacity spread evenly and never bunch on one edge. The rendered body grows until every side has room at a minimum pitch, so **overlap is prevented by construction** — the stored `pos_x/pos_y/width/height` are never rewritten, so drag-and-drop coordinates keep their meaning.
- Name, exact seat count and a written status all appear on the table, plus an `aria-label` combining them; status is additionally distinguished by border style (solid/dotted/dashed), so **state never depends on colour alone**.
- **Tests:** `40-table-layout-chairs.spec.ts` — **10/10**, measuring real DOM rectangles to prove no chair overlaps another chair or the table, at 2/4/5/6/8/10 seats, plus capacity changes, a 360px-wide check and a **visual-regression snapshot** of a single node (chosen over the whole canvas so other specs' tables cannot make it flaky).

### PHASES O/P/Q/R — login, out-of-zone, ordering, delivery validation — **Done**
- **O:** customers now land in the ordering flow (`/customer/branches`) rather than a summary dashboard. `lib/auth/login-destination.ts` honours a `callbackUrl` only when it is a same-site path **and inside the user's own section** — a scheme, `//host`, a backslash, CR/LF or `/api/` is discarded, and a branch manager arriving with `?callbackUrl=/customer/branches` still lands in their own area.
- **P:** the out-of-zone page states plainly why delivery is off, offers "update address" and "check my location again", and shows every real branch with brand, hours, phone, distance and delivery availability. Ordering is disabled by mouse (`pointer-events: none`), by keyboard (`tabindex="-1"`, no link element) and **by API** — a direct order or quote from outside coverage is refused server-side. Search remains informational and cannot re-enable delivery.
- **Q:** the end-to-end scenario is written against a branch the test CREATES at a generic coordinate — no branch id or name is hardcoded — and walks nearest branch → eligible category → eligible product → variation → server quote → placed order.
- **R:** two real gaps were found and closed. (1) **Category eligibility was not enforced at order time**: a product under a deactivated category could still be quoted and ordered through the API even though the menu hid it. Quote and create now share `orderableProductWhere`, which applies the same rule as the customer catalogue. (2) **No duplicate-checkout protection**: added `Order.idempotencyKey` with a unique `(customerId, idempotencyKey)` index; the checkout page sends one key per attempt, so a double-tap or a retry returns the **same order** instead of creating a second. A "same items, recently" heuristic was deliberately rejected — it would have refused a customer legitimately re-ordering the same food.
- Client-supplied `branch_id`, fee, distance and totals remain ignored, and a later branch-fee change does not alter a placed order. **Tests:** `41-login-zone-ordering.spec.ts` — **11/11**.

### PHASES E/F — GPS and maps — **Done**
- **Freshness:** both location endpoints now accept `captured_at` and refuse a stale (>5 min) or future-dated fix, so a replayed or cached position cannot be stored as "current".
- **Bug found and fixed:** `lat: null` was coerced by `Number(null)` to **0** and accepted as a valid latitude (the equator). `coordinateOrNaN` now rejects null/empty/boolean, so a missing coordinate is a 400 rather than a silently wrong location.
- The customer location card is now mounted on the page customers actually land on, and only prompts on an explicit action — never automatically, and never again by itself after a refusal. The rider tracker sends capture time and shows its GPS state including the healthy one (a silent tracker leaves a rider unable to tell "working" from "quietly broken"); tracking still requires an active duty session (409 otherwise).
- **F:** `BranchLocationPanel` renders a map **only when a key is configured and only when asked for** (the iframe is created on demand), and otherwise gives the address, the server-computed distance, the coverage verdict and a directions link built from the ADDRESS — the branch's stored coordinates are never published. Distance and coverage are the server's; nothing is recomputed client-side. **Tests:** `42-gps-and-maps.spec.ts` — **7/7**.

### PHASES A/B/C — design consistency, SEO/responsiveness, performance — **Done**
- **SEO (new):** `lib/seo/site.ts` resolves the origin from the request's own host first (falling back to `NEXT_PUBLIC_APP_URL`/`AUTH_URL`, then localhost) — taking the configured value first was wrong, because a test or staging server would then publish the production domain's canonicals. Added `app/robots.ts` (every authenticated section explicitly disallowed), `app/sitemap.ts` (public pages only), root + homepage metadata with canonical/Open Graph/Twitter, `noindex` on the authenticated and auth layouts, and JSON-LD Organization/Restaurant data built from the **real branch rows**.
- **Heading order:** the homepage jumped h1 → h3. The brand name in the menu section is that section's heading and is now marked up as an `h2` — styling unchanged.
- **Touch targets:** the BN/EN language buttons were under 32px tall on mobile; they now have a real minimum height.
- **Responsiveness:** verified with measured `scrollWidth - clientWidth` at **320, 360, 375, 390, 414, 768, 1024 and 1440px** across the homepage, three customer pages, four Branch Manager pages and three admin pages — zero horizontal overflow anywhere.
- **Performance — measured, not claimed.** All 104 public assets were already WebP, and menu images already go through `next/image`, so re-encoding sources would not change what users download. The charts turned out to be dependency-free server components, so there was no bundle to lazy-load. What was real: five raw `<img>` tags had no intrinsic size (layout shift) and now carry width/height plus lazy/async decoding. Measured on the test server: **homepage 52 requests / 1407KB total / 163KB JS / 882KB images; BM dashboard 51 requests / 23KB; live board 4 polls in ~6s** at the stated 2s interval, dropping to **zero while the tab is hidden**. No Lighthouse score is claimed anywhere.
- **Tests:** `43-seo-responsive.spec.ts` — **9/9**; `44-performance.spec.ts` — **5/5**.

### Round 7 — regressions found by the full suite, and what they actually were
The first complete run after the phase work finished came back **12 failed / 478 passed**. Every one was traced rather than silenced:
- **8 failures were consequences of the intended PHASE O change.** Specs asserted that a customer LANDS on `/customer/dashboard`, which is exactly what Phase O changed. Rather than move the landing back, `ROLE_DASHBOARD` was introduced alongside `ROLE_HOME`: a link labelled "Dashboard" (public header) goes to the dashboard, while the post-login landing is the ordering flow. The dashboard specs now navigate there explicitly. The customer dashboard itself was not altered.
- **1 was an over-strict assertion of my own** (`no link to follow`): the Phase F panel adds an informational *directions* link inside the disabled card. The card is still non-interactive by mouse and keyboard, so the assertion was corrected to what the requirement actually says — no route into the branch menu.
- **2 were synchronisation, not behaviour.** The branch-search box is an uncontrolled input in a server-rendered form; a `fill()` landing before hydration was discarded and the form submitted an EMPTY query. The fill is now re-applied until it sticks (the same technique the shared login helper already uses) and the test waits for the form's navigation. The table-layout snapshot captured whatever was painted over its region, so a neighbouring table drifting into the box registered as a diff; the snapshot subject was moved clear of the other specs' tables.
- **1 was a genuine UI flaw:** if the live board's FIRST poll failed, it showed "Loading…" for ever. It now renders an explicit error state instead of waiting silently.

### Deployment note (nothing was deployed in this session)
`dev.db` deliberately still carries the **pre-Round-7** schema — three migrations are pending against it:
`20260722110803_add_order_status_event_history`, `20260722114851_add_reward_earning_rules_teams_platter_archive`, `20260722130000_add_order_idempotency_key`.
All three are additive and data-preserving (new nullable columns/tables; the one UNIQUE index is on `(customerId, idempotencyKey)`, where SQLite treats the existing NULLs as distinct, so no existing order conflicts). They were applied to the isolated test database only. **They must be applied to `dev.db` — after a timestamped backup and with row counts checked before and after — at the same time as the code is deployed**, or the running app will hit schema drift exactly as it did earlier in Round 6.

### Test-database contention (shared machine) — settings, not test weakening
This project runs on a machine shared with several other applications; during long suite runs the box load climbed high enough to produce two classes of sporadic, non-deterministic failure that were traced to infrastructure, never to product code:
- **SQLite write-lock contention** (`P1008` / P2024 / 45s timeouts on multi-step order flows). Fixed at the connection level, not by weakening any assertion: the test datasource URL now carries `connection_limit=1` (SQLite has exactly one writer, so serialising removes the lock fight), `pool_timeout=60` (a burst — e.g. six concurrent orders — queues instead of failing at the 10s default) and `socket_timeout` (a slow individual query waits rather than erroring). The per-test `timeout` was raised 45s → 90s for the same reason: a delivered-order flow (transaction → notifications → reward award → commission), serialised through one connection on a busy box, can legitimately exceed 45s. No expectation was changed.
- **Server self-fetch cascade under thrash** (`Error: bad port` / `fetch failed`): the app's server components fetch their own Route Handlers over HTTP, so a thrashing box makes those self-calls fail en masse — a whole-suite symptom that clears entirely on a calm box (a run on a load-~2 box produced 0 `bad port` errors). This is the deployment architecture meeting an overloaded host, not a code defect.
Several tests also had their own fixture preconditions hardened as a result (rider left off-duty before a duty-gating check; the "nearest branch" order test moved to a coordinate clear of the INSIDE fixtures other tests in its file create; the multi-role login redirect split one-test-per-role so seven sign-ins do not share one time budget). These make the tests state-independent; none weakens what is asserted. No `test.skip`/`only`/`fixme`, no arbitrary sleeps, no serial-mode masking, no global retries were introduced.

---

## Round 8 — one system-wide form-validation standard

Every form in the app now follows the same order: **client JS rules first → request only if they pass → server validates again → the server's per-field messages come back and render under those same fields → values are never cleared on failure.** Reset happens only after a confirmed success.

### The gap this closed
The backend was already strong — the service layer throws `validationError({ field: … })` in ~250 places — but **`errorState()` in `lib/api/actions.ts` flattened that field map into a single sentence**, so a backend error could only ever appear as a banner. Meanwhile 30 of the 39 `<form>` files had no client validation at all, and no control carried `aria-invalid`/`aria-describedby`. The fix was made at the contract level rather than form-by-form, then applied to every form.

### Shared layer (new)
- **`lib/validation/contract.ts`** — `FieldErrors`, `parseFieldErrors()`. Normalizes every payload shape the API already produces (`{detail}`, `{field: "…"}`, `{field: ["…"]}`, `{"variations.0.price": […]}`, `non_field_errors`) into `{ fieldErrors, formError }`. Client-safe.
- **`lib/validation/limits.ts`** — the SINGLE source of every constraint (regexes, lengths, money/percent/radius/party-size ranges, upload types+size). **Imported by both the client rules and the server validators**, so a rule cannot drift between the two sides. This fixed three real mismatches: the phone regex (client `01\d{9}` vs server `01[3-9]\d{8}`), the accepted image types (client allowed GIF, the Sharp pipeline rejected it), and notice `body` (client required it, server did not).
- **`components/ui/field-error.tsx`** — `<FieldError>` / `<FormError>` plus the `Field`↔control context. Small red text below the field, readable in light and dark, `role="alert"`, stable id.
- **`components/ui/field-class.ts`** — the control styling extracted so Server Components can use it without pulling in the client bundle.

### Shared layer (upgraded)
- **`lib/validation/rules.ts`** — grew from 9 to 30 rules (url, integer, positive, nonNegative, money with decimal-precision, range, oneOf, checked, groupRequired, date/time, afterField/onOrAfterField/afterTimeField, notPast/notFuture, password, maxLength, validateImageFile). `number` now rejects `NaN`/`Infinity`/`"1e5"` instead of coercing.
- **`lib/validation/use-form-validation.ts`** — errors no longer appear when a form opens: a field reveals its message after blur or after a submit attempt, then re-validates as it is fixed. Adds server-error merging, focus+scroll to the first invalid field (DOM order, not rules order), a double-submit guard, file-input checks, an `onSubmitValid` hook for fetch-driven forms, and a `formProps` bundle that always sets `noValidate`.
- **`lib/validation/server.ts`** — added `validateRequired/Email/Url/Number/Money/Enum/Date/Time/Range/Image`, all reading from `limits.ts`, plus **`withConstraintErrors()`**, which turns an expected Prisma `P2002/P2003/P2025` into a field message so raw Prisma text (model names, columns, SQL) can never reach the client.
- **`components/ui/input.tsx`** — `Field` now provides a11y wiring through context and `Input`/`Textarea`/`Select`/`Checkbox` consume it, so `aria-invalid` + `aria-describedby` are applied automatically wherever `<Field error={…}>` is used. Added `FieldGroup` for radio/checkbox sets and non-input controls (star rating, payment cards) — one group label and one message, never the same error repeated per option. The invalid state is a red border **plus a ring**, so it is not signalled by colour alone.

### Backend response format
Unchanged on the wire — the existing field→message map is already the contract. What changed is that it now survives the trip: `errorState()` and the auth actions return `{ error (form-level only), fieldErrors, submissionId }`. Status codes are untouched, and **authorization failures stay 401/403 form-level messages — they are never disguised as field validation errors**.

### Coverage
33 form components now use `useFormValidation`; 36 files render `FieldError`/`FormError` or parse field maps. Updated across public/auth (login, register, forgot-password, change-password, profile), Super Admin (users, branches, categories, products, admin categories, reward config, reward rules, company logo, notices), Branch Manager (employees, teams, attendance, table layout, Ramadan config/slots/menus, reservations, delivery settings + zones + time slots), Customer (addresses, reviews, redeem, complaints, chat, checkout, Ramadan booking), Rider (duty panel, assignment gate, order panel), and Marketing/Accounts (campaigns, coupons, segments, refunds, expenses, adjustments, settlements, Ramadan transactions).

Specific behaviours worth noting:
- **Repeated rows** (product variations, reward earn-rules, delivery areas) use structured paths — `variations.0.price` — on BOTH sides, so each message renders under that exact input; the server's `normalizeVariations()` was changed to key its errors the same way. Rows use stable keys, and one bad row never removes the valid ones.
- **Two browser `prompt()` dialogs were replaced with inline validated fields** (Ramadan reservation rejection reason, Ramadan transaction refund amount) — a prompt cannot be validated and has nowhere to show a message.
- **Login** no longer disables its submit button on an incomplete form; it submits, validates, and says what is wrong. Invalid credentials stay deliberately form-level so neither secret is revealed.
- **Uploads** keep the chosen file when it fails validation (so the user can see what was rejected) and keep the previously saved image on screen; leaving a file input empty on an edit form still means "keep the current image".
- **Checkout** preserves cart, address, area and payment choice on every failure, and issues a fresh idempotency key only for a retry that produced no order.

### i18n
41 keys added to each of `messages/en.json` and `messages/bn.json` (2836 → 2877). **Parity verified programmatically: 0 en-only, 0 bn-only.** New keys live under `validation.*` and `errors.validation.*`; messages are specific and user-facing ("Phone number must contain 11 digits"), never internal field names.

### Verification
`tsc --noEmit` clean, `eslint .` clean (0 errors, 0 warnings), `next build` succeeds. Lint caught one real defect during the work — `checkout-form.tsx` called hooks after an early return — which was fixed rather than suppressed. No page audit, crawler run, Playwright run, PM2 restart or deployment was performed in this session; the user is verifying the forms manually.

---

## Round 9 — authenticated dashboard redesign

- **Scope:** all 153 authenticated routes inventoried in `DASHBOARD_UI_REDESIGN_AUDIT.md`; public homepage/components stayed unchanged.
- **Shared system:** semantic dashboard tokens, accessible skip link/content target, non-wrapping mobile topbar, 44px navigation controls, refined role sidebar/status rail, server-first page headers/breadcrumbs/sections, shaped loading/error states, canonical summary cards, URL filter shell, responsive data view, compact action menu, and accessible confirmation dialog with focus trap/restore.
- **Responsive lists:** shared `Table` now renders labelled mobile row cards below `md` while preserving the same rows, actions, data, and desktop table semantics. `OrderTable` and Admin Users use richer domain-specific mobile cards.
- **Real summaries:** Super Admin Users excludes the signed-in admin exactly like its API; Branch Manager Orders uses manager-owned branch scope; Customer Orders uses signed-in customer scope. No current-page totals, fake trends, or invented estimates. Rider history reads actual wallet ledger earnings.
- **Reports:** Admin, Accounts, Branch Manager, and Marketing report hubs use the canonical summary system with existing authorized aggregates.
- **Rider:** online/duty state and current order now lead the dashboard; critical action is 48px; duty chat follows operational panels; the former delivery-count estimate was removed.
- **Performance:** summary queries run in parallel; order summaries use one grouped query; the redundant Branch Manager pending-order request was removed; no new client dependency, interval, or per-page polling was added.
- **i18n:** EN/BN recursive key parity is 2942/2942.
- **Verification completed:** a fresh production build generated 242 routes; app/components/lib/E2E ESLint completed with exit 0; EN/BN parity is 2942/2942; and all 153 audit rows have final classifications. Earlier focused browser runs passed 37 checks: 21 all-role dashboard captures (desktop/tablet/mobile), 7 design-system checks, 3 role-scope summary checks, 2 Rider checks, 2 repeated confirmation-dialog checks, and focused table/breadcrumb checks. The final focused rerun and full legacy `tests/e2e/full-page-audit` launch were blocked before app execution: the sandbox denied the required localhost listener and the required escalation was rejected by the Codex approval usage limit. This is unavailable final browser evidence, not a product failure; the final status remains incomplete until those browser matrices can run.

---

## Round 9 — dashboard redesign: verification unblocked, shared views completed (design only)

The dashboard redesign had been left `INCOMPLETE` solely because the previous session could not
start a browser. This round executed those matrices and fixed what they exposed. **No feature, route,
API contract, permission, validation rule, or schema changed.**

- **Verification executed:** 12 redesign-spec checks, 74 legacy dashboard/rider checks, a 55-check
  combined re-run, and 3 new checks — all against a fresh production build on an isolated port and
  the isolated E2E database. `tsc`, `eslint`, and the production build are clean; EN/BN parity is
  2,945 keys each with zero mismatch.
- **Real defect fixed:** the topbar account dropdown had `role="menuitem"` on its `<a>` items, which
  overrides the implicit `link` role, so "My Profile"/"Change Password" were no longer links — and
  the ARIA menu pattern lacked the arrow-key focus management it promises. It is now a labelled
  `<nav>` disclosure of ordinary Tab-reachable links.
- **Rider baseline:** the diff was inspected before acceptance. It is the intentional Rider
  reordering (duty/online above the fold, duty chat demoted), which `47-rider-mobile-redesign`
  independently asserts.
- **26 routes brought onto the design system by upgrading 3 shared views** rather than duplicating
  markup across page shells: notifications (7), complaints (8), management reports (11).
- **Two new aggregates** in `lib/services/page-summaries.ts` reuse the *exact* scoping of the lists
  they sit above (`userId` for notifications, `complaintsWhereForUser()` for complaints), are one
  grouped query each, and count the whole result set rather than the fetched page — so no card shows
  a fake or out-of-scope number.
- **Honest remainder:** ten nested form/detail routes are still on their earlier presentation and are
  listed by name in `DASHBOARD_UI_REDESIGN_AUDIT.md`.

**Process note:** while trying to free a port I ran a broad `pkill -f "next-server"`. This machine
hosts other applications; that pattern could have stopped them. It did not (18 sibling server
processes verified still running), and the run was moved to a dedicated port instead. Broad process
kills must not be used on this shared server.

---

## Round 10 — internal (non-dashboard) page enhancement, partial (design only)

Scope: authenticated non-dashboard pages. **All 7 dashboard home routes were left
untouched** (verified: `git status` shows no `*/dashboard/page.tsx` change), and no
public page changed. No feature, route behaviour, API, permission, validation rule,
or schema changed.

### Route audit built from source, not from reports
`INTERNAL_PAGE_ENHANCEMENT_AUDIT.md` inventories all **154** authenticated routes.
Each row is derived by reading the route's own source **plus the source of every
local component it imports**, so a route is credited with summary cards /
responsive cards / a confirm modal only when that primitive really appears in the
code it renders. Result: 7 `DASHBOARD_EXCLUDED`, 41 `ENHANCED`, 1
`DEDICATED_PAGE_CREATED`, 105 `EXISTING_PAGE_REFINED`.

### Destructive actions — completed
Every destructive action that previously fired straight from a click is now
guarded, and no `window.confirm()`/`prompt()` remains anywhere:
- delete branch table (names the table),
- cancel Ramadan booking (names date + slot),
- reject rider withdrawal (amount + mandatory reason, validated inside the dialog
  so the message sits beside the field),
- mark withdrawal paid (terminal money movement).

### Create-flow separation — pattern proven on one module
`/admin/categories` no longer hosts a create form beside its table. The form moved
verbatim to a new `/admin/categories/new` route with breadcrumb, context cards and
a back action; the list page is list-only with the primary action in its header,
and its now-unneeded branch query was dropped.

### Honestly incomplete
Seven list pages still embed create/edit panels (`/admin/rewards`,
`/branch-manager/employees`, `/branch-manager/tables`,
`/branch-manager/ramadan-bookings`, `/branch-manager/delivery-hours`,
`/branch-manager/delivery-zone`, `/marketing/audience`). Search/filters/pagination
are still absent on the smaller lists. Both are enumerated by route in
`INTERNAL_PAGE_ENHANCEMENT_AUDIT.md`.

### Checks
`tsc --noEmit` clean · `eslint .` clean · production build clean (new route
generated) · EN/BN 2,953 keys each with 0 mismatch · 68 dashboard/redesign specs
pass · 2 new specs pass. All browser runs used the isolated E2E database on
`E2E_PORT=3111`; no broad process-kill command was used this round.

---

## Round 11 — server-side list controls on the reported pages (design/query only)

The screenshots showed authenticated lists rendering every record with no cards,
search, filters or pagination. **No dashboard home page and no public page was
touched; no feature, API contract, permission, validation rule or schema changed.**

### Shared infrastructure (new)
- `lib/http/list-params.ts` — parses and **clamps** `page`/`pageSize`/`search`/
  `sort`/`direction` plus typed enum/date filters. `sort` resolves against an
  explicit whitelist, so a crafted query string can never reach Prisma's
  `orderBy`. `pageMeta()` reports a page past the end as the last real page, so
  removing the final row never leaves an empty invalid page. `listHref()`
  rebuilds URLs preserving other params and resets `page` when a filter changes.
- `components/dashboard/list-controls.tsx` — `ListSearch`, `ListFilterSelect`,
  `ListPagination`. All server-rendered GET forms/links: no hydration cost, and
  Back/Forward work. Pagination shows "Showing X–Y of Z" and carries the active
  search, filters and sort on every link.

### Pages converted
`/admin/customers`, `/admin/staff`, `/admin/orders`,
`/admin/branch-manager-history`, `/admin/activity-logs`, `/admin/branches` —
each now has real aggregate cards, entity-appropriate search, relevant filters,
active-filter chips, a results count, a distinct no-results state and
**server-side pagination**. Orders in particular no longer fetches 100 records
and renders them all; it queries Prisma through `ordersWhereForUser()`, the same
scope selector the API uses, so RBAC is unchanged.

Two scope bugs were caught while doing this: the staff summary initially counted
`role != customer` (which includes super admins) while the directory lists five
specific roles — both now share one `STAFF_ROLES` constant; and the activity-log
cards report only the three activity types the data actually records, with no
invented "security-sensitive" bucket.

### Evidence
`tests/e2e/50-list-pagination-search.spec.ts` asserts values, not element
presence: rendered rows never exceed the page size, the total card equals the
authoritative API count, the "Showing X–Y" range equals the rows rendered,
clicking the blocked card filters the URL *and every rendered row is blocked*,
Back restores the unfiltered list, and `?role=rider` returns only riders. 5/5
pass; 60/60 existing dashboard specs pass; `tsc`, `eslint` and the production
build are clean; EN/BN 2,986 keys each with 0 mismatch.

### Honestly outstanding
About 20 further list routes still load unbounded data and are named
route-by-route in `INTERNAL_PAGE_ENHANCEMENT_AUDIT.md`. The helpers above are the
ready-made pattern for each.

### Round 11b — navigation did not start at the top

Reported: moving between authenticated pages left the new page part-way down.
Measured before the fix: scrolled to 118px, navigated, landed at **289px**.

Two separate causes, both fixed:

1. **The real one, and it was self-inflicted.** The focus-restore effect added to
   `ConfirmModal` ran its *close* branch on MOUNT, when the dialog had never been
   open — so every row's dialog called `.focus()` on its trigger button, and
   focusing an element scrolls it into view. A list rendering one modal per row
   therefore dragged the page down to some row on every navigation. Instrumenting
   `scrollTo`/`focus`/`scrollIntoView` in the browser identified it; a `wasOpen`
   ref now restores focus only after a dialog that actually opened.
2. **Next's documented default.** `<Link>` maintains scroll position and, when it
   does scroll, targets "the top of the first Page element", skipping sticky and
   fixed siblings. `ScrollToTop` in the authenticated layout now owns scroll
   position, and the sidebar links pass `scroll={false}` so the two do not race.
   It ignores in-page anchors, so the skip link still works, and uses `instant`
   so no unrequested motion is introduced.

Scoped to `app/(dashboard)/layout.tsx` — no public page is affected.
`tests/e2e/51-navigation-scroll-reset.spec.ts` covers sidebar navigation,
query-string-only navigation and the skip link; it passed 4 consecutive runs, and
68/68 across the dashboard suites. One flake in the first draft of that spec was
my test's own precondition (a page shorter than the window cannot scroll), fixed
with a short viewport rather than by weakening the assertion.

---

## Round 12 — the two failing pages, and a class of latent failures behind them

### Root cause of "Something went wrong. Could not load data."

`/branch-manager/reports` rendered by having a **server component fetch the app's
own Route Handler over HTTP** (`getJSON("/dashboard/branch-manager/")`). That
handler is a four-line wrapper around `branchManagerDashboard()`. The loopback
request added a whole failure surface unrelated to the report — host/origin
resolution (this dev server is reached over a LAN IP, hence `allowedDevOrigins`),
cookie forwarding, and the self-call failing under load, which this project had
already hit once and recorded as `bad port`/`fetch failed`. Any of those surfaced
to the user as the error boundary.

The fix calls the same service directly. Data, branch scope and RBAC are
identical — the handler wrapped nothing else — and one HTTP round trip per render
disappears.

**Ten pages shared this pattern**, so all ten were converted rather than only the
reported one: branch-manager/reports, marketing/reports, marketing/customers,
accounts/sales, accounts/reports, management/performance, management/analytics,
admin/reports, rider/deliveries, rider/duty-history.

`/branch-manager/dashboard` already called its service directly and returned HTTP
200 throughout; it is covered by the new spec so a regression would be caught.
Its markup was not touched.

### Compact density — opt-in, so dashboards are untouched

All seven dashboard homes use the same `DashboardPage` wrapper, so a blanket
density change would have redesigned them. `DashboardPage` now takes an opt-in
`density="compact"` that sets `data-density`, with the rules in ONE block in
`globals.css` (h1 24/26px, summary-card value 24/26px, card min-height 6.5rem,
table rows `py-2`). Internal list pages opt in; dashboard homes do not.

Evidence that dashboards are visually unchanged: the rider dashboard **pixel
snapshot** passes untouched, along with 91/91 dashboard specs.

### Raw translation keys

`common.disable` / `common.enable` genuinely did not exist, so the raw key string
rendered. Rather than fix only those two, a scan of every static `t("…")` call
against `en.json` found three more missing keys — `marketingX.campaignsTitle`,
`marketingX.couponsTitle`, `branchManager.totalOrders`. All five added to both
locales. EN/BN: 2,991 keys each, 0 mismatch.

### Checks
`tsc`, `eslint`, production build clean. 19/19 on the new report-load +
list-pagination + scroll specs; 91/91 across the dashboard suites.

### Honestly outstanding
The screenshot list pages other than the five fixed in Round 11 (Management
Branches/Orders, Marketing Products/Campaigns/Coupons, BM Catalog/Riders/
Reservations/Employees/Attendance) still lack summary cards and server-side
pagination. They are named route-by-route in `INTERNAL_PAGE_ENHANCEMENT_AUDIT.md`.

---

## Round 13 — Product system: the database becomes the single source of truth

Full detail in `PRODUCT_SYSTEM_SYNC_AUDIT.md`. Summary of what changed here.

### The defect

The public homepage never queried the database for products. `MenuSection`
imported `MENU_ITEMS` from `lib/home/menu-data.ts` — **107 products** hardcoded
in source — and `NavSearch` imported the search index derived from it. Overlap
with the 41 real `Product` rows: **zero**. No admin edit, price change, hold,
deactivation or delete could reach the storefront, because the two systems shared
no rows. Not a caching fault; there was nothing to invalidate.

`lib/home/menu-data.ts` is deleted. `lib/services/public-catalog.ts` builds the
storefront from the database and maps rows onto the existing `MenuItem` shape, so
the cards, modals, grid, brand tabs and styling are unchanged.

### One eligibility definition

Three competing definitions existed — `productsForUser`, `orderableProductWhere`
and an inline filter in `resolveDeliveryBranch` — and they disagreed, so a product
could be listed but unorderable or the reverse. All now compose
`lib/services/product-eligibility.ts` (`customerProductWhere` for queries,
`isProductOrderable` for rows loaded by id). Homepage, menu, search, product
detail, cart, quote, checkout and order creation share it.

### Cache invalidation

The app has no ISR, no `fetch` cache and no `unstable_cache`; the cache that
mattered was Next's client Router Cache, and product mutations revalidated only
two admin paths — never `/`. `lib/cache/catalog.ts` `revalidateCatalog()` now
lists every product-rendering surface and is called from every product, variation,
category and branch mutation that can change eligibility. Product images already
use immutable UUID filenames and additionally carry `?v=updatedAt`.

### Historical snapshot defect (found while verifying)

`OrderItem` snapshotted price and variation but read `product_name`/`product_image`
from the live relation, so renaming a product rewrote past orders. Fixed with the
round's only schema change — additive `productName` / `productImage` columns,
migration `20260803131915_order_item_product_snapshot`, written as plain
`ALTER TABLE ADD COLUMN` rather than Prisma's table rebuild. Timestamped backup
taken first; all eight critical row counts identical before and after; 128/128
order lines backfilled.

### Admin control

`/admin/products` and `/admin/products/deactivated` rebuilt with 10-per-page
server pagination, search, filters, whitelisted sorting, filter chips, mobile
cards and a compact action menu. New dedicated **Product View** pages for both
Super Admin and Branch Manager. Every destructive action now goes through a
confirmation modal that names the product; the delete modal states plainly that
it is a soft delete. `ConfirmModal` gained a controlled mode so a dialog can
outlive the pop-up menu that opened it. Super Admin was given the
reason-carrying activate/deactivate path (previously branch-manager-only);
branch-manager scoping is unchanged and still server-enforced.

No new "homepage visibility" fields were added — `isAvailable`, `heldByAdmin`,
`deletedAt`, `categoryId`, `isPopular` and `isRecommended` already provide the
control, and all are managed from the existing product form.

### Checks

`tsc`, `eslint`, production build clean. 20/20 on the new
`54-product-system-sync` spec; admin product-family audits, `01-public-auth`,
`03-permissions`, `24-new-features`, `43-seo-responsive`, public-auth audit and
`53-customer-home-redirect` re-run green. EN/BN: **3,015 keys each, 0 mismatch**.

### Honestly outstanding

Two failing tests were confirmed **pre-existing** by reproducing them identically
on the untouched 30 Jul build (`29-…:358` foreign delivery area,
`26-…:294` checkout coverage widget); a third passes in isolation and fails only
under cross-test pollution. `/branch-manager/catalog` is still unpaginated.
Storefront paid add-ons and choice groups were part of the deleted hardcoded data
and have no schema equivalent; modelling them needs a new table.

---

## Round 14 — Nearest-branch homepage scoping

Full detail in `NEAREST_BRANCH_HOMEPAGE_AUDIT.md`.

An authenticated customer's storefront is now scoped to their single nearest
eligible branch, resolved server-side from their own trusted GPS fix or default
saved address. Every homepage section — cards, category tabs, group headings and
the nav search index — is built from that one query, so a global category can no
longer merge two branches' products.

Reused the project's existing `nearestEligibleBranch` service rather than adding a
second one; two hardenings were made inside it (deterministic distance-then-lowest-id
tie-break, and the point's source exposed for UI wording), plus a 24-hour read-side
trust window so a stale GPS fix falls through to the saved address instead of being
used silently. `lib/services/customer-branch.ts` is a thin context wrapper.

Three enforcement gaps found and closed: `GET /api/products?branch=` honoured any
branch id for a customer, `GET /api/products/[id]` had no branch scope, and
`/customer/branches/[id]/menu` had no guard. Categories are branch-scoped for
customers too.

A compact branch bar (`components/home/BranchBar.tsx`) carries branch name, brand,
distance, prep time and delivery fee, plus the location-setup and out-of-zone
states — one slim band in the storefront's own palette, no redesign.

Cache isolation: customer→branch resolution is never cached, no customer id,
address id or coordinate appears in any cache key, and there is no shared
catalogue entry to leak. Asserted in both directions by test.

**Checks:** `tsc`, `eslint`, production build clean. EN/BN **3038 keys each, 0
mismatch**. `55-nearest-branch-homepage.spec.ts` **22/22**; combined with
`53-customer-home-redirect` **48 passed, 0 failed**.

**Honestly outstanding:** 13 tests in `26-nearest-branch-checkout` and
`29-variation-type-visibility-search` fail (verified on a fresh, separately seeded
database, so not data drift). Both specs create a branch at the same point the
customer stands on and then query Main Branch's catalogue as that customer —
under the new rule the customer correctly resolves to the fixture branch. They
encode the previous "a customer may read any branch's catalogue" model and need
fixture restructuring that was not completed. Separately, `54-product-system-sync`
fails on the shared test database because its `firstCategory()` helper does not
filter to ACTIVE categories — a pre-existing fixture bug unrelated to this work.

---

## Round 15 — "No items found" for Super Admin: the brand tab

Full detail in `SUPER_ADMIN_ORDERING_AUDIT.md`.

An active MADCHEF product showed in `/admin/products` but the homepage said
"No items found". The product was fully eligible and WAS returned by the
selector; super admin already took the all-branches path. `HomeCartProvider`
hardcoded `useState<Brand>("cheez")` and `MenuSection` filters on brand, so an
all-Madchef catalogue rendered an empty grid — and the tab chip printed the
BRANCH count, identical on both tabs, so nothing pointed at the other brand.
Measured on the user's own database: 1 eligible product, `{cheez: 0, madchef: 1}`.

Fixed: the opening brand tab is chosen server-side from the brands that have
products; tab chips show real per-brand counts; an empty brand points at the one
that has items. Added branch labels on cards for multi-branch catalogues and a
single-branch cart lock with a named switch confirmation. Customer nearest-branch
scope is unchanged and re-asserted.

**Checks:** `tsc`, `eslint`, build clean. EN/BN **3049 each, 0 mismatch**.
`56-super-admin-catalogue` **8/8**; with `55` and `53`, **55 passed, 1 failed**
(that one passes in isolation — shared-fixture interaction, not a defect).

**Outstanding:** no super-admin branch filter control; super-admin checkout not
verified end to end.

---

## Round 16 — System-wide dropdown arrows

Full detail in `DROPDOWN_ARROW_AUDIT.md`.

Every `<select>` in the app rendered as a plain text input. One cause:
`SELECT_EXTRA_CLASS` set `appearance-none pr-9` — stripping the browser's arrow
so the option list could be themed — and never drew a replacement. `pr-9`
reserved space for an arrow that did not exist.

Fixed in that one constant plus a `.field-select-arrow` rule in
`app/globals.css`: a single themed chevron drawn as an inline data-URI
background image (no network request, no wrapper element needed for the many
bare server-rendered selects, inert by definition so it cannot intercept the
click that opens the list). `appearance-none` stays, so there is exactly one
arrow. Separate light/dark ink because a data URI cannot inherit `currentColor`;
`opacity` drop when disabled; `[dir="rtl"]` flip for a future RTL locale.

No `appearance-none` exists anywhere outside `field-class.ts`, so no page-level
select bypassed the shared style and no local exception was required. Custom
triggers were reviewed: the two profile menus already had chevrons; three-dot
action menus and the segmented language toggle are correctly excluded.

**Checks:** `tsc`, `eslint`, build clean. `58-dropdown-arrows` **13/13**,
asserting computed styles and behaviour rather than class names — both themes
with different ink, disabled, invalid, five mobile widths, Bangla, automatic
filtering still working, keyboard focus, and text inputs NOT gaining an arrow.

**Outstanding:** the theme switcher's 44 px icon-only trigger has no chevron
(adding one requires resizing it); Chromium-only verification; RTL rule written
but not exercised.

---

## Round 17 — Product Create/Edit redesign

The page looked empty because the **`<form>` element itself** carried
`max-w-3xl`. Widening the `Card` around it (round 16) changed nothing — the form
still stopped at 768px inside a full-width card, leaving the right third blank
and, because `lg:` column counts key off VIEWPORT width, squeezing the variations
grid at the same time.

Restructured into a real two-column editor (`lg:grid-cols-12`, 8 + 4), collapsing
to one column below `lg` with the sidebar last:

- **Main** — Basic Information (name at 2/3 width, description) and Variations.
- **Sidebar** — Product Organization (branch, brand, category, variation type),
  Pricing & Preparation, Product Image, Visibility & Promotion, and the save
  actions as a normal card at the foot rather than a fixed bar over the fields.

New `components/catalog/form-section.tsx` renders each group as a titled
`<section>` with a real `<h2>`, so the grouping is in the document outline and
not only in the styling. The outer `Card`/`CardContent` wrapper was removed from
all four product pages — it had become an empty frame around cards.

Variations are now numbered cards ("Variation 1"), with Default / Enabled /
Remove on a divided footer inside their own card so Remove can never drift away
from the row it deletes.

**No functionality changed**: every field name, handler, `data-testid`, error key
and the variations JSON payload are identical. The one deliberate behavioural
edit is the Edit page's primary action label — `common.update` → new
`catalog.saveChanges` ("Save Changes"), as specified; three selectors in
`full-page-audit/admin.spec.ts` were updated to match.

**Checks:** `tsc`, `eslint`, build clean. EN/BN **3058 each, 0 mismatch**.
`60-product-form-layout` **8/8** — measured from the box model: no dead zone
(< 80px unused), sidebar genuinely right of the main column, all six section
headings present on Create AND Edit, edit values preserved, variation inputs
> 150px, no field over 700px, no horizontal overflow at 320–1024px, and the form
still creates a product. Dropdown-arrow and large-image suites re-run green.

**Outstanding:** `full-page-audit/admin.spec.ts:2882` still fails on
`results.length === count` (1549 products vs the API's 100-row cap) — pre-existing
test-data drift, unrelated to layout.
