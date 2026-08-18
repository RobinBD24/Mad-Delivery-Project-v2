import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * req #20 (nearest branch enforced server-side in order creation) + req #6
 * (checkout delivery-area selector & server-derived summary) + the full customer
 * checkout journey and its edge cases:
 *   branch-spoof · no-eligible-branch · product-mismatch · pickup keeps branch
 *   archived/inactive branch excluded · held-area blocked · server-derived quote
 *   failed order leaves the cart intact · line dedupe · no duplicate order
 *   nearest-branch API ownership · GPS ownership · address IDOR · EN + BN
 *
 * Server rules are asserted at the API layer (the real security boundary); the
 * UI journey is driven end-to-end through the browser.
 */

const INSIDE = { lat: 23.781, lng: 90.408 }; // inside Main Branch coverage (≈0 km)
const OUTSIDE = { lat: 23.95, lng: 90.62 }; // outside every seeded branch's radius

/**
 * A customer's catalogue is scoped to their nearest eligible branch, resolved
 * server-side from their own stored coordinates — so a customer with no location
 * has no branch and therefore no products. Every customer session in this file
 * seeds one, which is what a real customer always has by the time they browse.
 */
async function seedCustomerLocation(
  req: APIRequestContext,
  point: { lat: number; lng: number } = INSIDE,
) {
  const res = await req.post(`${API_BASE}/api/customer/location`, {
    data: { lat: point.lat, lng: point.lng, accuracy: 10, captured_at: Date.now() },
  });
  expect(res.status(), "customer location seeded").toBe(200);
}
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}
async function firstProduct(req: APIRequestContext, branchId: number): Promise<{ id: number }> {
  const { results } = await (await req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=50`)).json();
  return results[0];
}
async function placeDelivery(
  req: APIRequestContext,
  body: { branch_id: number; product_id: number; lat?: number; lng?: number; area_id?: number },
) {
  return req.post(`${API_BASE}/api/orders/`, {
    data: {
      branch_id: body.branch_id,
      payment_method: "cash",
      delivery_address: "Dhanmondi, Dhaka",
      fulfillment_type: "delivery",
      ...(body.lat != null ? { lat: body.lat, lng: body.lng } : {}),
      items: [{ product_id: body.product_id, quantity: 1 }],
      ...(body.area_id ? { delivery_area_id: body.area_id } : {}),
    },
  });
}

/**
 * Create an ACTIVE single-brand branch centred on `pt` (its default radius
 * covers the point) plus a category + product. A single-brand branch (cheez) is
 * used so the product's brand is implied — no brand field required.
 */
async function createEligibleBranch(req: APIRequestContext, pt: { lat: number; lng: number }) {
  const created = await req.post(`${API_BASE}/api/branches/`, {
    multipart: {
      name: uniq("EligBranch"),
      address: "Test Rd, Dhaka",
      phone: `013${Math.floor(10000000 + Math.random() * 89999999)}`,
      brand_type: "cheez",
      latitude: String(pt.lat),
      longitude: String(pt.lng),
      prep_time_minutes: "18",
      pickup_enabled: "true",
      pickup_address: "Test pickup",
    },
  });
  expect(created.status(), "branch created").toBe(201);
  const branch = await created.json();
  const cat = await req.post(`${API_BASE}/api/categories/`, {
    data: { branch_id: branch.id, name: uniq("Cat") },
  });
  const category = await cat.json();
  const prod = await req.post(`${API_BASE}/api/products/`, {
    multipart: {
      branch_id: String(branch.id),
      name: uniq("Prod"),
      category: String(category.id),
      preparation_time: "18",
      variations: JSON.stringify([{ name: "Regular", price: 250, isDefault: true, isEnabled: true }]),
    },
  });
  expect(prod.status(), "product created").toBe(201);
  return { branch, product: await prod.json() };
}

// ── req #20 — nearest branch enforced in order creation ────────────────────
test.describe("#20 server-derived delivery branch (order creation)", () => {
  test("client branch_id is IGNORED — the branch is derived from the cart's product", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const bm = await branchMap(admin.req);
    const main = bm["Main Branch"];
    const otherId = Object.entries(bm).find(([name]) => name !== "Main Branch")?.[1] ?? main;
    const mainProduct = await firstProduct(customer.req, main);

    // Spoof a DIFFERENT branch_id while ordering a Main-Branch product.
    const res = await placeDelivery(customer.req, {
      branch_id: otherId,
      product_id: mainProduct.id,
      ...INSIDE,
    });
    expect(res.status(), "order accepted").toBe(201);
    const order = await res.json();
    // Server resolves the branch from the product, not the spoofed branch_id.
    expect(order.branch, "branch derived from product").toBe(main);
  });

  test("DELIVERY out of every branch's coverage is rejected (no eligible branch)", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstProduct(customer.req, main);
    const res = await placeDelivery(customer.req, { branch_id: main, product_id: product.id, ...OUTSIDE });
    expect(res.status(), "rejected — no branch covers the point").toBe(400);
  });

  test("DELIVERY without coordinates is rejected (coverage cannot be bypassed)", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstProduct(customer.req, main);
    const res = await placeDelivery(customer.req, { branch_id: main, product_id: product.id });
    expect(res.status(), "missing coords → 400").toBe(400);
  });

  test("a cart mixing two branches' products is rejected (product mismatch)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const p1 = await firstProduct(customer.req, main);
    // A product from a DIFFERENT branch makes the cart span two branches.
    const { product: p2 } = await createEligibleBranch(admin.req, INSIDE);
    const res = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Dhaka",
        fulfillment_type: "delivery", ...INSIDE,
        items: [{ product_id: p1.id, quantity: 1 }, { product_id: p2.id, quantity: 1 }],
      },
    });
    expect(res.status(), "cross-branch cart → 400").toBe(400);
  });

  test("an INACTIVE branch is excluded from delivery", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const { branch, product } = await createEligibleBranch(admin.req, INSIDE);

    // While active + covering the point → order succeeds and uses this branch.
    const ok = await placeDelivery(customer.req, { branch_id: branch.id, product_id: product.id, ...INSIDE });
    expect(ok.status(), "eligible branch accepts the order").toBe(201);
    expect((await ok.json()).branch).toBe(branch.id);

    // Deactivate it (SA) → the same delivery is now rejected (isActive guard).
    const patched = await admin.req.patch(`${API_BASE}/api/branches/${branch.id}/`, {
      multipart: { is_active: "false" },
    });
    expect(patched.status(), "deactivated").toBeLessThan(300);
    const afterInactive = await placeDelivery(customer.req, { branch_id: branch.id, product_id: product.id, ...INSIDE });
    expect(afterInactive.status(), "inactive branch excluded").toBe(400);
  });

  test("an ARCHIVED branch is excluded from delivery", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const { branch, product } = await createEligibleBranch(admin.req, INSIDE);
    const ok = await placeDelivery(customer.req, { branch_id: branch.id, product_id: product.id, ...INSIDE });
    expect(ok.status(), "eligible branch accepts the order").toBe(201);

    // Archive it (SA; it has a product dependency → archived, not deleted).
    expect((await admin.req.delete(`${API_BASE}/api/branches/${branch.id}/`)).status()).toBeLessThan(300);
    const afterArchive = await placeDelivery(customer.req, { branch_id: branch.id, product_id: product.id, ...INSIDE });
    expect(afterArchive.status(), "archived branch excluded").toBe(400);
  });

  test("PICKUP uses the explicit branch (no coordinates required)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstProduct(customer.req, main);
    const res = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Pickup at counter",
        fulfillment_type: "pickup",
        items: [{ product_id: product.id, quantity: 1 }],
      },
    });
    expect(res.status(), "pickup accepted without coords").toBe(201);
    expect((await res.json()).branch, "pickup keeps the chosen branch").toBe(main);
  });
});

// ── req #6 — server-derived checkout quote + held-area block ────────────────
test.describe("#6 checkout quote (server-derived)", () => {
  async function areasFor(req: APIRequestContext, branchId: number) {
    const r = await req.get(`${API_BASE}/api/branches/${branchId}/delivery-areas`);
    return (await r.json()).results as { id: number; name: string; is_held: boolean; delivery_charge: string; estimated_delivery_minutes: number }[];
  }

  test("total = subtotal + selected area charge; charge/estimate come from the area", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstProduct(customer.req, main);
    const areas = await areasFor(customer.req, main);
    const active = areas.find((a) => !a.is_held)!;

    const res = await customer.req.post(`${API_BASE}/api/delivery/quote`, {
      data: {
        branch_id: main, fulfillment_type: "delivery", ...INSIDE,
        delivery_area_id: active.id,
        items: [{ product_id: product.id, quantity: 2 }],
      },
    });
    expect(res.status()).toBe(200);
    const q = await res.json();
    expect(q.delivery_charge).toBeCloseTo(Number(active.delivery_charge), 2);
    expect(q.delivery_estimate_minutes).toBe(active.estimated_delivery_minutes);
    expect(q.total).toBeCloseTo(q.subtotal + q.delivery_charge, 2);
    expect(q.prep_time_minutes).not.toBeNull();
    // Overall estimate = prep + delivery time.
    expect(q.overall_estimate_minutes).toBe(q.prep_time_minutes + q.delivery_estimate_minutes);
  });

  test("selecting a HELD area is rejected at quote AND at order time", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstProduct(customer.req, main);
    const held = (await areasFor(customer.req, main)).find((a) => a.is_held)!;
    expect(held, "a held area is seeded").toBeTruthy();

    const quote = await customer.req.post(`${API_BASE}/api/delivery/quote`, {
      data: { branch_id: main, fulfillment_type: "delivery", ...INSIDE, delivery_area_id: held.id, items: [{ product_id: product.id, quantity: 1 }] },
    });
    expect(quote.status(), "held area quote → 400").toBe(400);
    const order = await placeDelivery(customer.req, { branch_id: main, product_id: product.id, ...INSIDE, area_id: held.id });
    expect(order.status(), "held area order → 400").toBe(400);
  });
});

// ── req #20/#4 + ownership — nearest-branch & GPS APIs ─────────────────────
test.describe("nearest-branch + GPS ownership", () => {
  test("customer-only; marks the nearest covered branch eligible and disables the rest", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const staff = await newSession(browser, "super_admin");

    // Staff cannot read the customer nearest-branch endpoint (role boundary).
    expect((await staff.req.get(`${API_BASE}/api/customer/nearest-branch`)).status()).toBe(403);

    // Save the customer's own live location, then read the eligibility map.
    expect((await customer.req.post(`${API_BASE}/api/customer/location`, { data: { lat: INSIDE.lat, lng: INSIDE.lng } })).status()).toBeLessThan(300);
    const res = await customer.req.get(`${API_BASE}/api/customer/nearest-branch`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.has_location).toBe(true);
    expect(data.nearest, "a nearest eligible branch exists").toBeTruthy();
    const eligible = data.branches.filter((b: { eligible: boolean }) => b.eligible);
    expect(eligible, "exactly one branch is eligible").toHaveLength(1);
    expect(eligible[0].id).toBe(data.nearest.id);
  });

  test("GPS save is self-only and coordinate-validated", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    // Invalid coordinates are rejected.
    expect((await customer.req.post(`${API_BASE}/api/customer/location`, { data: { lat: 999, lng: 999 } })).status()).toBe(400);
    // Staff cannot use the customer GPS endpoint at all (no cross-user writes).
    const staff = await newSession(browser, "super_admin");
    expect((await staff.req.post(`${API_BASE}/api/customer/location`, { data: { lat: INSIDE.lat, lng: INSIDE.lng } })).status()).toBe(403);
  });

  test("address IDOR — a customer cannot mutate another customer's address", async ({ browser }) => {
    const a = await newSession(browser, "customer");
    await seedCustomerLocation(a.req);
    const b = await newSession(browser, "qa_upload_1");
    const created = await a.req.post(`${API_BASE}/api/customer/addresses/`, {
      data: { label: "Home", address: uniq("addr") + ", Dhaka", is_default: false },
    });
    expect(created.status()).toBeLessThan(300);
    const addr = await created.json();
    // Customer B must not be able to edit or delete customer A's address.
    expect((await b.req.patch(`${API_BASE}/api/customer/addresses/${addr.id}/`, { data: { label: "hax" } })).status()).toBeGreaterThanOrEqual(400);
    expect((await b.req.delete(`${API_BASE}/api/customer/addresses/${addr.id}/`)).status()).toBeGreaterThanOrEqual(400);
  });
});

// ── req #6/#9 — full customer checkout journey through the browser ─────────
test.describe("customer checkout journey (UI)", () => {
  async function seedLocationAndOpenMenu(session: Awaited<ReturnType<typeof newSession>>, branchId: number) {
    await session.req.post(`${API_BASE}/api/customer/location`, { data: { lat: INSIDE.lat, lng: INSIDE.lng } });
    await session.page.goto(`/customer/branches/${branchId}/menu`);
    await expect(session.page.getByTestId("menu-add").first()).toBeVisible();
  }

  test("browse nearest branch → add to cart → area + coverage → place order", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];

    // The customer's branches page enables only the nearest eligible branch.
    await customer.req.post(`${API_BASE}/api/customer/location`, { data: { lat: INSIDE.lat, lng: INSIDE.lng } });
    await customer.page.goto("/customer/branches");
    await expect(customer.page.getByTestId("branch-enabled").first()).toBeVisible();

    await seedLocationAndOpenMenu(customer, main);
    await customer.page.getByTestId("menu-add").first().click();

    const ordersBefore = (await (await customer.req.get(`${API_BASE}/api/orders/?page_size=1`)).json()).count;

    await customer.page.goto("/customer/checkout");
    await customer.page.getByTestId("cov-lat").fill(String(INSIDE.lat));
    await customer.page.getByTestId("cov-lng").fill(String(INSIDE.lng));
    await customer.page.getByTestId("cov-check").click();
    await expect(customer.page.getByTestId("cov-covered")).toBeVisible();

    // Pick a delivery area → the server-derived total appears.
    await customer.page.getByTestId("area-select").selectOption({ index: 1 });
    await expect(customer.page.getByTestId("summary-total")).toBeVisible();

    await customer.page.getByTestId("summary-address").scrollIntoViewIfNeeded().catch(() => {});
    const addr = customer.page.locator('textarea[name="delivery_address"]');
    if ((await addr.inputValue()).trim() === "") await addr.fill("Dhanmondi 27, Dhaka");

    await customer.page.getByTestId("place-order").click();
    await customer.page.waitForURL("**/customer/orders/**", { timeout: 20_000 });
    await expect(customer.page).toHaveURL(/placed=1/);

    // Exactly ONE order was created (no duplicate on a single confirm).
    const ordersAfter = (await (await customer.req.get(`${API_BASE}/api/orders/?page_size=1`)).json()).count;
    expect(ordersAfter).toBe(ordersBefore + 1);
  });

  test("a failed order leaves the cart intact; identical adds dedupe into one line", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];

    await seedLocationAndOpenMenu(customer, main);
    // Add the SAME product twice → the cart must dedupe to a single line, qty 2.
    await customer.page.getByTestId("menu-add").first().click();
    await customer.page.getByTestId("menu-add").first().click();
    const cart = await customer.page.evaluate(() => JSON.parse(localStorage.getItem("mad-delivery-cart") || "{}"));
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);

    // Force a server rejection: delivery with OUT-OF-COVERAGE coords (no coverage
    // check, so fulfillment stays "delivery"). The order fails and the cart stays.
    await customer.page.goto("/customer/checkout");
    await customer.page.getByTestId("cov-lat").fill(String(OUTSIDE.lat));
    await customer.page.getByTestId("cov-lng").fill(String(OUTSIDE.lng));
    const addr = customer.page.locator('textarea[name="delivery_address"]');
    if ((await addr.inputValue()).trim() === "") await addr.fill("Nowhere, Dhaka");
    await customer.page.getByTestId("place-order").click();

    // An error surfaces AND the cart is untouched (still one line, qty 2).
    await expect(customer.page.locator('[role="alert"]').first()).toBeVisible();
    const cartAfter = await customer.page.evaluate(() => JSON.parse(localStorage.getItem("mad-delivery-cart") || "{}"));
    expect(cartAfter.items).toHaveLength(1);
    expect(cartAfter.items[0].quantity).toBe(2);
  });

  test("checkout renders in Bangla (bn)", async ({ browser }) => {
    const customer = await newSession(browser, "customer", "bn");
    await seedCustomerLocation(customer.req);
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    await seedLocationAndOpenMenu(customer, main);
    await customer.page.getByTestId("menu-add").first().click();
    await customer.page.goto("/customer/checkout");
    // Bangla summary heading (checkout.summaryTitle = "অর্ডার সারাংশ").
    await expect(customer.page.getByTestId("order-summary")).toContainText("অর্ডার সারাংশ");
  });
});
