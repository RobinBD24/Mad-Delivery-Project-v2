import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * Gap #1 — server-side OPENING-HOURS enforcement (§8 / §17 / §18).
 *
 * Coverage (`isActive` / zone) was already enforced; a branch merely CLOSED for
 * the night was not. These tests prove the "Show, disable, 'Opens at HH:MM'"
 * contract end to end:
 *
 *   - a covered-but-closed branch is SHOWN, DISABLED, and carries an "Opens at …"
 *     note instead of the generic out-of-area one;
 *   - the nearest OPEN eligible branch is the primary (nearest-badged) one, even
 *     when a CLOSED branch is physically closer;
 *   - a direct order/quote to a closed branch is HARD-BLOCKED server-side (§20),
 *     on `branch_id` with the "branch closed" reason — never a way around it;
 *   - when EVERY covered branch is closed, the page shows an all-closed banner
 *     (naming when it reopens), not a false "out of coverage".
 *
 * Determinism: hours are enforced off the app timezone (Asia/Dhaka). The OPEN
 * branch is seeded with NO hours (null ⇒ always orderable — the same rule that
 * keeps the rest of the suite deterministic). The CLOSED branch is a NON-late
 * `madchef` branch whose window opens two hours from now: a madchef branch is
 * "closed" both before its opening minute AND before 04:00, so a future window is
 * closed at every possible wall-clock, with no dependence on the CI box's time.
 */

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Minutes-since-midnight in Asia/Dhaka — the SAME zone the server enforces hours
 * in (lib/services/branch-hours.ts), so a window we derive here is closed on the
 * server's clock, not the CI box's local/UTC one.
 */
function dhakaMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hh * 60 + mm;
}

/** Minutes-since-midnight → "HH:MM", wrapping across midnight. */
const toHM = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

async function setLocation(req: APIRequestContext, point: { lat: number; lng: number }) {
  const res = await req.post(`${API_BASE}/api/customer/location/`, {
    data: { lat: point.lat, lng: point.lng, accuracy: 10 },
  });
  expect(res.status(), "location saved").toBe(200);
}

/**
 * A fresh active branch at `point` with one active category + product. `brandType`
 * and the (optional) hours are explicit so a caller can seed a branch that is OPEN
 * (omit hours ⇒ null ⇒ always orderable) or CLOSED right now (a non-late `madchef`
 * branch whose window starts in the future).
 */
async function makeBranchWithMenu(
  admin: { req: APIRequestContext },
  point: { lat: number; lng: number },
  opts: { brandType: string; namePrefix: string; openingTime?: string; closingTime?: string },
) {
  const tag = uniq();
  const branch = await (
    await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: `${opts.namePrefix}-${tag}`,
        address: "Test Rd, Sylhet",
        phone: `019${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: opts.brandType,
        latitude: String(point.lat),
        longitude: String(point.lng),
        delivery_radius_km: "5",
        ...(opts.openingTime ? { opening_time: opts.openingTime } : {}),
        ...(opts.closingTime ? { closing_time: opts.closingTime } : {}),
      },
    })
  ).json();
  expect(branch.id, "branch created").toBeTruthy();

  const category = await (
    await admin.req.post(`${API_BASE}/api/categories/`, {
      data: { name: `Cat-${tag}`, branch_id: branch.id, is_active: true },
    })
  ).json();
  expect(category.id, "category created").toBeTruthy();

  const product = await (
    await admin.req.post(`${API_BASE}/api/products/`, {
      multipart: {
        branch_id: String(branch.id),
        category: String(category.id),
        name: `Prod-${tag}`,
        variation_type: "THICK",
        variations: JSON.stringify([{ name: "Regular", price: 450, isDefault: true, isEnabled: true }]),
      },
    })
  ).json();
  expect(product.id, "product created").toBeTruthy();

  return { branch, category, product };
}

test.describe("Phase — opening hours: nearest OPEN branch is primary", () => {
  // Sylhet — deliberately far from every seeded/fixture cluster (Dhaka ~23.78/90.40
  // with radii up to 8 km; Chittagong 22.35/91.78), so ONLY the branches THIS test
  // creates cover the customer and "nearest open is primary" is about them.
  const HERE = { lat: 24.9, lng: 91.87 };
  const CLOSER_CLOSED = { lat: 24.91, lng: 91.87 }; // ~1.1 km — physically CLOSER
  const FARTHER_OPEN = { lat: 24.92, lng: 91.87 }; //  ~2.2 km — farther, still < 5 km

  test("a closed branch is shown but disabled with 'Opens at …'; the nearest OPEN branch is primary", async ({
    browser,
  }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, HERE);

    const base = dhakaMinutesNow();
    const openingTime = toHM(base + 120); // opens in 2h
    const closingTime = toHM(base + 240); // closes in 4h
    // CLOSER but CLOSED — a non-late madchef branch with a future window.
    const closed = await makeBranchWithMenu(admin, CLOSER_CLOSED, {
      brandType: "madchef",
      namePrefix: "ClosedBr",
      openingTime,
      closingTime,
    });
    // FARTHER but OPEN — no hours ⇒ always orderable.
    const open = await makeBranchWithMenu(admin, FARTHER_OPEN, {
      brandType: "cheez",
      namePrefix: "OpenBr",
    });

    await customer.page.goto("/customer/branches");

    // The farther OPEN branch is the ONE enabled, nearest-badged primary — proving
    // selection prefers the nearest OPEN branch over the merely-closest one.
    const openCard = customer.page.getByTestId("branch-enabled").filter({ hasText: open.branch.name });
    await expect(openCard).toHaveCount(1);
    await expect(openCard.getByTestId("branch-nearest-badge")).toBeVisible();

    // The CLOSER branch is shown, disabled, with an "Opens at HH:MM" note (not the
    // generic out-of-area note) and never the nearest badge.
    const closedCard = customer.page.getByTestId("branch-disabled").filter({ hasText: closed.branch.name });
    await expect(closedCard).toHaveCount(1);
    await expect(closedCard.getByTestId("branch-disabled-note")).toContainText(openingTime);
    await expect(closedCard.getByTestId("branch-nearest-badge")).toHaveCount(0);
  });

  test("the API hard-blocks an order/quote to a closed branch, but allows the open one", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, HERE);

    const base = dhakaMinutesNow();
    const openingTime = toHM(base + 120);
    const closingTime = toHM(base + 240);
    const closed = await makeBranchWithMenu(admin, CLOSER_CLOSED, {
      brandType: "madchef",
      namePrefix: "ClosedBr",
      openingTime,
      closingTime,
    });
    const open = await makeBranchWithMenu(admin, FARTHER_OPEN, {
      brandType: "cheez",
      namePrefix: "OpenBr",
    });

    // A quote to the CLOSED branch's product → 400, rejected on branch_id with the
    // "branch closed" reason. A COVERAGE rejection would land on delivery_address,
    // so this pair distinguishes the two without depending on the message locale.
    const closedQuote = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: {
        branch_id: closed.branch.id,
        fulfillment_type: "delivery",
        ...HERE,
        items: [{ product_id: closed.product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(closedQuote.status(), "a closed branch cannot be quoted").toBe(400);
    const closedQuoteBody = await closedQuote.json();
    expect(closedQuoteBody.branch_id, "rejected with branchClosed (branch_id)").toBeTruthy();
    expect(closedQuoteBody.delivery_address, "not a coverage rejection").toBeFalsy();

    // The same for a real order: the block is server-side (§20), so a direct API
    // call with a genuine branch id + product is refused all the same.
    const closedOrder = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: closed.branch.id,
        payment_method: "cash",
        delivery_address: "Sylhet",
        fulfillment_type: "delivery",
        ...HERE,
        items: [{ product_id: closed.product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(closedOrder.status(), "a closed branch cannot be ordered").toBe(400);
    const closedOrderBody = await closedOrder.json();
    expect(closedOrderBody.branch_id, "rejected with branchClosed (branch_id)").toBeTruthy();
    expect(closedOrderBody.delivery_address, "not a coverage rejection").toBeFalsy();

    // POSITIVE CONTROL — same customer, same location: the OPEN branch quotes and
    // orders fine. So the 400s above are about HOURS, not coverage or location.
    const openQuote = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: {
        branch_id: open.branch.id,
        fulfillment_type: "delivery",
        ...HERE,
        items: [{ product_id: open.product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(openQuote.status(), "the open branch quotes fine").toBe(200);
    expect((await openQuote.json()).branch.id, "the server picked the open branch").toBe(open.branch.id);

    const openOrder = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: open.branch.id,
        payment_method: "cash",
        delivery_address: "Sylhet",
        fulfillment_type: "delivery",
        ...HERE,
        items: [{ product_id: open.product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(openOrder.status(), "the open branch orders fine").toBe(201);
  });
});

test.describe("Phase — every covered branch is closed", () => {
  // A second clear cluster ~28 km from the one above (well beyond the 5 km radii),
  // so this test's lone closed branch is the ONLY thing covering its customer and
  // the two describes never contaminate each other under parallel execution.
  const HERE = { lat: 24.7, lng: 91.7 };
  const NEAR = { lat: 24.708, lng: 91.7 }; // ~0.9 km

  test("shows an all-closed banner (not out-of-zone) and nothing orderable", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, HERE);

    const base = dhakaMinutesNow();
    const openingTime = toHM(base + 120);
    const closingTime = toHM(base + 240);
    const closed = await makeBranchWithMenu(admin, NEAR, {
      brandType: "madchef",
      namePrefix: "OnlyClosed",
      openingTime,
      closingTime,
    });

    await customer.page.goto("/customer/branches");

    // Covered-but-closed is NOT "out of zone": the all-closed banner shows (naming
    // when it reopens), the out-of-zone banner does not, and nothing is orderable.
    const banner = customer.page.getByTestId("all-closed-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(openingTime);
    await expect(customer.page.getByTestId("out-of-zone-banner")).toHaveCount(0);

    const card = customer.page.getByTestId("branch-disabled").filter({ hasText: closed.branch.name });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("branch-disabled-note")).toContainText(openingTime);
    await expect(
      customer.page.getByTestId("branch-enabled").filter({ hasText: closed.branch.name }),
      "the only covered branch is closed, so it is not orderable",
    ).toHaveCount(0);
  });
});
