import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, login, API_BASE, PASSWORD, ROLE_HOME, atPath } from "./helpers";

/**
 * PHASES O, P, Q, R — login destination, the out-of-zone experience, ordering
 * from a nearby branch, and the server-side delivery validation behind both.
 *
 * Phase Q is deliberately written against a branch this spec CREATES at a
 * generic coordinate (the "Banani-like" scenario) — no real branch id or name
 * is hardcoded, so the test proves the rule rather than the fixture.
 */

const INSIDE = { lat: 23.7925, lng: 90.4078 }; // the customer's location
const FAR_AWAY = { lat: 22.3569, lng: 91.7832 }; // ~215 km away
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function setLocation(req: APIRequestContext, point: { lat: number; lng: number }) {
  const res = await req.post(`${API_BASE}/api/customer/location/`, {
    data: { lat: point.lat, lng: point.lng, accuracy: 10 },
  });
  expect(res.status(), "location saved").toBe(200);
}

/** A fresh active branch at `point`, with an active category and product. */
async function makeBranchWithMenu(admin: { req: APIRequestContext }, point: { lat: number; lng: number }) {
  const tag = uniq();
  const branch = await (await admin.req.post(`${API_BASE}/api/branches/`, {
    multipart: {
      name: `QBranch-${tag}`,
      address: "Generic Rd, Dhaka",
      phone: `019${Math.floor(10000000 + Math.random() * 89999999)}`,
      brand_type: "cheez",
      latitude: String(point.lat),
      longitude: String(point.lng),
      delivery_radius_km: "5",
    },
  })).json();

  // Categories are a JSON endpoint (products and branches are multipart).
  const categoryRes = await admin.req.post(`${API_BASE}/api/categories/`, {
    data: { name: `QCat-${tag}`, branch_id: branch.id, is_active: true },
  });
  expect(categoryRes.status(), "category created").toBe(201);
  const category = await categoryRes.json();

  const product = await (await admin.req.post(`${API_BASE}/api/products/`, {
    multipart: {
      branch_id: String(branch.id),
      category: String(category.id),
      name: `QProduct-${tag}`,
      variation_type: "THICK",
      variations: JSON.stringify([{ name: "Regular", price: 450, isDefault: true, isEnabled: true }]),
    },
  })).json();

  expect(branch.id, "branch created").toBeTruthy();
  expect(product.id, "product created").toBeTruthy();
  expect(product.category, "the product really is in the new category").toBe(category.id);
  return { branch, category, product };
}

/**
 * Log in on a raw page, optionally with a callbackUrl. Mirrors the shared
 * `login` helper's hydration handling: the submit button stays disabled until
 * React has registered the controlled inputs.
 */
async function loginWithCallback(page: import("@playwright/test").Page, username: string, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  const submit = page.locator('button[type="submit"]');
  await expect(async () => {
    await page.fill('input[name="identifier"]', username);
    await page.fill('input[name="password"]', PASSWORD);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // Drive to the OUTCOME (see the shared login helper): a click that lands during
  // a hydration reflow can be swallowed, so re-click until the form navigates.
  await expect(async () => {
    if (page.url().includes("/login")) await submit.click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("Phase O — login destination", () => {
  // One test per role: seven full sign-ins in a single test share one time
  // budget, and on a loaded machine the last of them runs out of it. Split, each
  // gets its own budget and a failure names the role that actually broke.
  for (const role of ["super_admin", "management", "marketing", "branch_manager", "accounts", "rider", "customer"]) {
    test(`${role} lands on its own home`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, role);
      await expect(page, `${role} landed on its own home`).toHaveURL(atPath(ROLE_HOME[role]));
      await context.close();
    });
  }

  // Each case is its own test: one full sign-in per test keeps every case inside
  // its own time budget (five sequential sign-ins in a single test can exceed it
  // on this shared box), and a failure names the exact callbackUrl that broke.
  test("a safe internal callbackUrl is honoured", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginWithCallback(page, "customer", "/customer/orders");
    await expect(page).toHaveURL(/\/customer\/orders$/);
    await context.close();
  });

  for (const evil of ["https://evil.example.com/steal", "//evil.example.com", "/\\evil.example.com", "/api/auth/session"]) {
    test(`an open redirect is refused: ${evil}`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginWithCallback(page, "customer", evil);
      await expect(page, `refused: ${evil}`).toHaveURL(atPath(ROLE_HOME.customer));
      expect(page.url(), "never leaves the site").toContain("localhost");
      await context.close();
    });
  }

  test("a staff member is never redirected into the customer ordering flow", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginWithCallback(page, "branch_manager", "/customer/branches");
    // The path is internal and therefore "safe", but the customer area refuses
    // a branch manager, who ends up back in their own section.
    await expect(page).toHaveURL(/\/branch-manager\//);
    await context.close();
  });
});

test.describe("Phase P — out of every delivery zone", () => {
  test("the page explains why, lists real branches, and keeps delivery disabled", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, FAR_AWAY);

    await customer.page.goto("/customer/branches");
    await expect(customer.page.getByTestId("out-of-zone-banner")).toBeVisible();
    await expect(customer.page.getByTestId("out-of-zone-update-address")).toBeVisible();
    await expect(customer.page.getByTestId("out-of-zone-retry")).toBeVisible();

    // Real branches from the database, with real detail — never a demo fallback.
    const cards = customer.page.getByTestId("branch-disabled");
    expect(await cards.count(), "real branches are still listed").toBeGreaterThan(0);
    await expect(cards.first().getByTestId("branch-brand")).not.toBeEmpty();
    await expect(cards.first().getByTestId("branch-hours")).not.toBeEmpty();
    await expect(cards.first().getByTestId("branch-distance")).not.toBeEmpty();
    await expect(cards.first().getByTestId("branch-delivery-availability")).not.toBeEmpty();

    // Nothing is orderable: no enabled card exists at all.
    expect(await customer.page.getByTestId("branch-enabled").count(), "no branch is orderable").toBe(0);
    // Disabled by mouse AND by keyboard.
    await expect(cards.first()).toHaveAttribute("aria-disabled", "true");
    await expect(cards.first()).toHaveAttribute("tabindex", "-1");
    expect(await cards.first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    // The card carries an informational directions link (PHASE F), which is not
    // an ordering action. What must not exist is a route into the branch menu.
    expect(await cards.first().locator('a[href*="/menu"]').count(), "no way into the menu").toBe(0);
    const hrefs = await cards.first().locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(hrefs.every((h) => !h.startsWith("/customer/branches/")), "no in-app branch link").toBe(true);
  });

  test("the API refuses an order from outside every zone, however it is called", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, FAR_AWAY);
    const { branch, product } = await makeBranchWithMenu(admin, INSIDE);

    // Direct API call with a real branch id and real product — still refused,
    // because coverage is decided server-side from the trusted coordinates.
    const res = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: branch.id, payment_method: "cash", delivery_address: "Far away",
        fulfillment_type: "delivery", ...FAR_AWAY,
        items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(res.status(), "URL/API manipulation cannot bypass the zone rule").toBe(400);

    // A quote is refused for the same reason, so the UI can explain it.
    const quote = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: {
        branch_id: branch.id, fulfillment_type: "delivery", ...FAR_AWAY,
        items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(quote.status()).toBe(400);
  });

  test("a search cannot re-enable delivery for a branch out of range", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, FAR_AWAY);
    await customer.page.goto("/customer/branches?search=a");
    expect(await customer.page.getByTestId("branch-enabled").count(), "search is informational only").toBe(0);
  });
});

test.describe("Phase Q/R — a nearby customer can complete an order", () => {
  test("nearest branch → eligible menu → variation → quote → order", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    // A location well clear of the INSIDE cluster the other tests in this file
    // populate (~9 km north), so THIS branch is unambiguously the only one whose
    // radius covers the customer — the "exactly one enabled" assertion is then
    // about this branch, not about how many fixtures a prior test left behind.
    const HERE = { lat: 23.8730, lng: 90.4078 };
    const { branch, category, product } = await makeBranchWithMenu(admin, HERE);
    await setLocation(customer.req, HERE);

    // 1. The branch is reachable and marked as the nearest eligible one, and it
    //    is the branch this test created.
    await customer.page.goto("/customer/branches");
    const enabled = customer.page.getByTestId("branch-enabled");
    await expect(enabled).toHaveCount(1);
    await expect(enabled.getByTestId("branch-nearest-badge")).toBeVisible();

    // 2. Its active category and product are visible to the customer.
    const cats = await (await customer.req.get(`${API_BASE}/api/categories/?branch_id=${branch.id}&page_size=100`)).json();
    expect((cats.results as { id: number }[]).some((c) => c.id === category.id), "active category visible").toBe(true);
    const products = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${branch.id}&page_size=100`)).json();
    const listed = (products.results as { id: number; variation_type: string }[]).find((p) => p.id === product.id);
    expect(listed, "active product visible").toBeTruthy();
    expect(listed!.variation_type, "its variation type is exposed for selection").toBe("THICK");

    // 3. The quote is computed server-side.
    const quote = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: {
        branch_id: branch.id, fulfillment_type: "delivery", ...HERE,
        items: [{ product_id: product.id, quantity: 2, variation_type: "THICK" }],
      },
    });
    expect(quote.status(), "quote succeeds inside the zone").toBe(200);
    const quoted = await quote.json();
    expect(quoted.branch.id, "the server picked the branch").toBe(branch.id);
    expect(quoted.subtotal, "2 × 450").toBe(900);
    expect(quoted.total).toBe(900 + quoted.delivery_charge);

    // 4. The order goes through, priced by the server.
    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: branch.id, payment_method: "cash", delivery_address: "Nearby, Dhaka",
        fulfillment_type: "delivery", ...HERE,
        items: [{ product_id: product.id, quantity: 2, variation_type: "THICK" }],
      },
    });
    expect(placed.status(), "order placed").toBe(201);
    const order = await placed.json();
    expect(order.branch, "served by the nearby branch").toBe(branch.id);
    expect(Number(order.subtotal ?? order.total_amount) > 0).toBe(true);
  });

  test("client-supplied money and branch are ignored; the snapshot is authoritative", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const { branch, product } = await makeBranchWithMenu(admin, INSIDE);
    const other = await makeBranchWithMenu(admin, INSIDE);
    await setLocation(customer.req, INSIDE);

    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        // A forged branch, a forged fee and a forged total, all of which the
        // server must discard in favour of its own computation.
        branch_id: other.branch.id,
        payment_method: "cash",
        delivery_address: "Nearby, Dhaka",
        fulfillment_type: "delivery",
        ...INSIDE,
        delivery_charge: 0,
        total_amount: 1,
        distance_km: 0,
        items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    // The cart's product belongs to `branch`, so that is who serves it.
    expect(order.branch, "the submitted branch_id is ignored").toBe(branch.id);
    expect(Number(order.total_amount), "the submitted total is ignored").toBeGreaterThan(1);

    // Later settings changes must not rewrite the placed order.
    const beforeFee = order.delivery_charge;
    await admin.req.patch(`${API_BASE}/api/branches/${branch.id}/`, { data: { delivery_fee: 999 } });
    const reread = await (await customer.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    expect(reread.delivery_charge, "the snapshot survives a later fee change").toBe(beforeFee);
  });

  test("a deactivated category makes its products unorderable, even via the API", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const { branch, category, product } = await makeBranchWithMenu(admin, INSIDE);
    await setLocation(customer.req, INSIDE);

    // It works while the category is active.
    const ok = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: { branch_id: branch.id, fulfillment_type: "delivery", ...INSIDE, items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }] },
    });
    expect(ok.status()).toBe(200);

    expect((await admin.req.patch(`${API_BASE}/api/categories/${category.id}/`, {
      data: { is_active: false },
    })).status()).toBe(200);

    // A malformed id is a client error, not a server error.
    expect((await admin.req.get(`${API_BASE}/api/categories/not-a-number/`)).status(), "NaN id → 400").toBe(400);

    // Now the catalogue hides it AND the order path refuses it.
    const products = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${branch.id}&page_size=100`)).json();
    expect((products.results as { id: number }[]).some((p) => p.id === product.id), "hidden from the menu").toBe(false);

    const refusedQuote = await customer.req.post(`${API_BASE}/api/delivery/quote/`, {
      data: { branch_id: branch.id, fulfillment_type: "delivery", ...INSIDE, items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }] },
    });
    expect(refusedQuote.status(), "an inactive category cannot be quoted").toBe(400);

    const refusedOrder = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: branch.id, payment_method: "cash", delivery_address: "Nearby, Dhaka",
        fulfillment_type: "delivery", ...INSIDE,
        items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
      },
    });
    expect(refusedOrder.status(), "an inactive category cannot be ordered").toBe(400);
  });

  test("a repeated checkout attempt returns the same order, not a second one", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const { branch, product } = await makeBranchWithMenu(admin, INSIDE);
    await setLocation(customer.req, INSIDE);

    const key = `test-${uniq()}`;
    const payload = {
      branch_id: branch.id, payment_method: "cash", delivery_address: "Nearby, Dhaka",
      fulfillment_type: "delivery", ...INSIDE, idempotency_key: key,
      items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
    };

    const first = await customer.req.post(`${API_BASE}/api/orders/`, { data: payload });
    expect(first.status()).toBe(201);
    const firstOrder = await first.json();

    // The same attempt again (a double-tap or a retry) must not create a second.
    const second = await customer.req.post(`${API_BASE}/api/orders/`, { data: payload });
    expect(second.status()).toBe(201);
    expect((await second.json()).id, "the original order is returned").toBe(firstOrder.id);

    const mine = await (await customer.req.get(`${API_BASE}/api/orders/?page_size=100`)).json();
    const matching = (mine.results as { id: number }[]).filter((o) => o.id === firstOrder.id);
    expect(matching.length, "exactly one order exists").toBe(1);

    // A genuine second order (new attempt, new key) is still allowed.
    const third = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: { ...payload, idempotency_key: `test-${uniq()}` },
    });
    expect(third.status()).toBe(201);
    expect((await third.json()).id, "a real re-order is not blocked").not.toBe(firstOrder.id);
  });

  test("other roles cannot place a customer order", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { branch, product } = await makeBranchWithMenu(admin, INSIDE);
    for (const role of ["branch_manager", "rider", "accounts"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.post(`${API_BASE}/api/orders/`, {
        data: {
          branch_id: branch.id, payment_method: "cash", delivery_address: "x",
          fulfillment_type: "delivery", ...INSIDE,
          items: [{ product_id: product.id, quantity: 1, variation_type: "THICK" }],
        },
      });
      expect(res.status(), `${role} refused`).toBe(403);
      await s.context.close();
    }
  });
});
