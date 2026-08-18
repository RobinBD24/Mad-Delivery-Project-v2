import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * REQ #4  product variation type (Thick / Thin / Both)
 * REQ #7  customer nearest-branch detection
 * REQ #8  no demo/fallback branches
 * REQ #9  active branch / category / product visibility
 * REQ #10 delivery-area validation
 * REQ #11 customer branch + catalogue search
 */

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const INSIDE = { lat: 23.781, lng: 90.408 };
const OUTSIDE = { lat: 23.95, lng: 90.62 };

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

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

async function makeProduct(
  req: APIRequestContext,
  branchId: number,
  variationType: string,
  extra: Record<string, string> = {},
) {
  const res = await req.post(`${API_BASE}/api/products/`, {
    multipart: {
      branch_id: String(branchId),
      name: uniq("P"),
      brand: "cheez",
      variation_type: variationType,
      variations: JSON.stringify([{ name: "Regular", price: 250, isDefault: true, isEnabled: true }]),
      ...extra,
    },
  });
  return res;
}

// ── REQ #4 — product variation type ───────────────────────────────────────
test.describe("#4 product variation type", () => {
  test("branch manager can create THICK / THIN / BOTH and the value persists on edit", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    for (const type of ["THICK", "THIN", "BOTH"]) {
      const res = await makeProduct(bm.req, own, type);
      expect(res.status(), `create ${type}`).toBe(201);
      const product = await res.json();
      expect(product.variation_type).toBe(type);

      // Editing an unrelated field must NOT erase the stored policy.
      const patched = await bm.req.patch(`${API_BASE}/api/products/${product.id}/`, {
        multipart: { name: `${product.name}-edited` },
      });
      expect(patched.status()).toBe(200);
      expect((await patched.json()).variation_type, "policy preserved on edit").toBe(type);

      // And it can be changed explicitly.
      const changed = await bm.req.patch(`${API_BASE}/api/products/${product.id}/`, {
        multipart: { variation_type: "BOTH" },
      });
      expect(changed.status()).toBe(200);
      expect((await changed.json()).variation_type).toBe("BOTH");
    }
  });

  test("an invalid variation type is rejected", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const res = await makeProduct(bm.req, own, "CRISPY");
    expect(res.status(), "unknown enum value rejected").toBe(400);
  });

  test("a branch manager cannot edit another branch's product", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const otherId = Object.values(await branchMap(admin.req)).find((id) => id !== own)!;

    const foreign = await (await makeProduct(admin.req, otherId, "THICK")).json();
    const res = await bm.req.patch(`${API_BASE}/api/products/${foreign.id}/`, {
      multipart: { variation_type: "THIN" },
    });
    expect(res.status(), "cross-branch edit refused").toBe(403);
  });

  test("customer cannot order a disallowed crust; BOTH requires a choice; snapshot is immutable", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];

    const thick = await (await makeProduct(admin.req, main, "THICK")).json();
    const both = await (await makeProduct(admin.req, main, "BOTH")).json();

    const order = (productId: number, variationType?: string) => ({
      branch_id: main, payment_method: "cash", delivery_address: "Crust test, Dhaka",
      fulfillment_type: "delivery", ...INSIDE,
      items: [{ product_id: productId, quantity: 1, ...(variationType ? { variation_type: variationType } : {}) }],
    });

    // THICK product + forged THIN → rejected server-side.
    expect((await customer.req.post(`${API_BASE}/api/orders/`, { data: order(thick.id, "THIN") })).status()).toBe(400);
    // THICK product with no explicit choice → accepted, snapshotted as THICK.
    const okThick = await customer.req.post(`${API_BASE}/api/orders/`, { data: order(thick.id) });
    expect(okThick.status()).toBe(201);
    expect((await okThick.json()).items[0].variation_type).toBe("THICK");

    // BOTH product with no choice → rejected (choice is mandatory).
    expect((await customer.req.post(`${API_BASE}/api/orders/`, { data: order(both.id) })).status()).toBe(400);
    // BOTH with a valid choice → accepted and snapshotted.
    const okBoth = await customer.req.post(`${API_BASE}/api/orders/`, { data: order(both.id, "THIN") });
    expect(okBoth.status()).toBe(201);
    const placed = await okBoth.json();
    expect(placed.items[0].variation_type).toBe("THIN");

    // Changing the product's policy afterwards must NOT rewrite the order line.
    expect((await admin.req.patch(`${API_BASE}/api/products/${both.id}/`, { multipart: { variation_type: "THICK" } })).status()).toBe(200);
    const reread = await (await customer.req.get(`${API_BASE}/api/orders/${placed.id}/`)).json();
    expect(reread.items[0].variation_type, "order snapshot immutable").toBe("THIN");
  });

  test("customer UI: BOTH offers both crusts and blocks add-to-cart until chosen", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const both = await (await makeProduct(admin.req, main, "BOTH", { name: uniq("BothPizza") })).json();

    await customer.req.post(`${API_BASE}/api/customer/location`, { data: INSIDE });
    await customer.page.goto(`/customer/branches/${main}/menu?search=${encodeURIComponent(both.name)}`);

    const card = customer.page.getByTestId(`product-card-${both.id}`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("crust-choice")).toBeVisible();
    await expect(card.getByTestId("crust-THICK")).toBeVisible();
    await expect(card.getByTestId("crust-THIN")).toBeVisible();

    // Add without choosing → blocked with a translated error, cart untouched.
    await card.getByTestId("menu-add").click();
    await expect(card.getByTestId("crust-error")).toBeVisible();
    const emptyCart = await customer.page.evaluate(() => localStorage.getItem("mad-delivery-cart"));
    expect(emptyCart == null || JSON.parse(emptyCart).items.length === 0).toBe(true);

    // Choose Thin → add succeeds and the crust is part of the cart line.
    await card.getByTestId("crust-THIN").click();
    await card.getByTestId("menu-add").click();
    await expect.poll(async () => {
      const raw = await customer.page.evaluate(() => localStorage.getItem("mad-delivery-cart"));
      return raw ? JSON.parse(raw).items.length : 0;
    }).toBe(1);
    const cart = JSON.parse((await customer.page.evaluate(() => localStorage.getItem("mad-delivery-cart")))!);
    expect(cart.items[0].variationType).toBe("THIN");

    // Thick of the SAME product is a SEPARATE cart line (crust is part of identity).
    await card.getByTestId("crust-THICK").click();
    await card.getByTestId("menu-add").click();
    await expect.poll(async () => {
      const raw = await customer.page.evaluate(() => localStorage.getItem("mad-delivery-cart"));
      return raw ? JSON.parse(raw).items.length : 0;
    }).toBe(2);
  });
});

// ── REQ #9 — customer visibility rules ────────────────────────────────────
test.describe("#9 active branch/category/product visibility", () => {
  test("inactive branch, inactive category and deleted product are all hidden", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];

    // (a) product under a deactivated category disappears from the customer menu
    const cat = await (await admin.req.post(`${API_BASE}/api/categories/`, {
      data: { name: uniq("HideCat"), branch_id: main },
    })).json();
    const prod = await (await makeProduct(admin.req, main, "THICK", { category: String(cat.id) })).json();

    const before = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${main}&page_size=200`)).json();
    expect(before.results.some((p: { id: number }) => p.id === prod.id)).toBe(true);

    await admin.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: false } });
    const after = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${main}&page_size=200`)).json();
    expect(after.results.some((p: { id: number }) => p.id === prod.id), "product under inactive category hidden").toBe(false);

    // (b) soft-deleted product disappears
    const live = await (await makeProduct(admin.req, main, "THICK")).json();
    expect((await admin.req.delete(`${API_BASE}/api/products/${live.id}/`)).status()).toBeLessThan(300);
    const afterDelete = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${main}&page_size=200`)).json();
    expect(afterDelete.results.some((p: { id: number }) => p.id === live.id), "deleted product hidden").toBe(false);
  });

  test("an INACTIVE branch is hidden from customers", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const created = await (await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: uniq("VisBranch"), address: "Vis Rd", phone: `015${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: "cheez", latitude: String(INSIDE.lat), longitude: String(INSIDE.lng),
      },
    })).json();

    const visible = await (await customer.req.get(`${API_BASE}/api/branches/?page_size=200`)).json();
    expect(visible.results.some((b: { id: number }) => b.id === created.id)).toBe(true);

    await admin.req.patch(`${API_BASE}/api/branches/${created.id}/`, { multipart: { is_active: "false" } });
    const hidden = await (await customer.req.get(`${API_BASE}/api/branches/?page_size=200`)).json();
    expect(hidden.results.some((b: { id: number }) => b.id === created.id), "inactive branch hidden").toBe(false);
  });

  test("historical orders still resolve their product snapshot", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const prod = await (await makeProduct(admin.req, main, "THICK")).json();

    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "History, Dhaka",
        fulfillment_type: "delivery", ...INSIDE,
        items: [{ product_id: prod.id, quantity: 1 }],
      },
    });
    expect(placed.status()).toBe(201);
    const order = await placed.json();

    // Soft-delete the product → the historical order remains readable.
    expect((await admin.req.delete(`${API_BASE}/api/products/${prod.id}/`)).status()).toBeLessThan(300);
    const reread = await customer.req.get(`${API_BASE}/api/orders/${order.id}/`);
    expect(reread.status(), "historical order readable").toBe(200);
    expect((await reread.json()).items.length).toBeGreaterThan(0);
  });
});

// ── REQ #8 — no demo/fallback branches ────────────────────────────────────
test.describe("#8 demo branch removal", () => {
  test("the public homepage lists only real database branches", async ({ page, request }) => {
    const { results } = await (await request.get(`${API_BASE}/api/branches/?page_size=200&is_active=true`)).json().catch(() => ({ results: [] }));
    await page.goto("/");
    const body = await page.locator("body").innerText();

    // None of the old hardcoded demo branch names may appear as branch cards.
    for (const demo of ["Bailey Road", "Bonosree", "Khilgaon", "Basundhara"]) {
      const isReal = (results as { name: string }[] | undefined)?.some((b) => b.name === demo);
      if (!isReal) expect(body, `demo branch "${demo}" must not be rendered`).not.toContain(demo);
    }
  });
});

// ── REQ #11 — customer branch + catalogue search ──────────────────────────
test.describe("#11 customer branch search", () => {
  test("exact, partial, case-insensitive and whitespace-padded queries all match", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const target = "Main Branch";
    for (const q of [target, "Main", "main branch", "MAIN BRANCH", "   Main Branch   "]) {
      const res = await customer.req.get(`${API_BASE}/api/branches/?page_size=100&search=${encodeURIComponent(q)}`);
      expect(res.status()).toBe(200);
      const { results } = await res.json();
      expect(results.some((b: { name: string }) => b.name === target), `query "${q}" matches`).toBe(true);
    }
  });

  test("a delivery-area name finds its branch", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const areaName = uniq("SearchArea");
    await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: main, name: areaName, estimated_delivery_minutes: 30, delivery_charge: 20 },
    });

    const { results } = await (await customer.req.get(`${API_BASE}/api/branches/?search=${encodeURIComponent(areaName)}`)).json();
    expect(results.some((b: { id: number }) => b.id === main), "found by delivery-area name").toBe(true);
  });

  test("no-results is empty (never a fallback branch) and search cannot bypass archived/inactive filters", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const { results: none } = await (await customer.req.get(`${API_BASE}/api/branches/?search=${encodeURIComponent(uniq("zzz-no-match"))}`)).json();
    expect(none.length, "no fabricated results").toBe(0);

    // An inactive branch cannot be surfaced by searching its exact name.
    const created = await (await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: uniq("HiddenSearch"), address: "Hidden Rd", phone: `016${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: "cheez",
      },
    })).json();
    await admin.req.patch(`${API_BASE}/api/branches/${created.id}/`, { multipart: { is_active: "false" } });
    const { results } = await (await customer.req.get(`${API_BASE}/api/branches/?search=${encodeURIComponent(created.name)}`)).json();
    expect(results.length, "inactive branch not searchable by customers").toBe(0);
  });

  test("branch search UI filters the list and keeps nearest-branch rules", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    await customer.req.post(`${API_BASE}/api/customer/location`, { data: INSIDE });

    await customer.page.goto("/customer/branches");
    await expect(customer.page.getByTestId("branch-enabled").first()).toBeVisible();

    // A query that matches nothing shows the translated no-results state.
    // The search box is an uncontrolled input inside a server-rendered form: a
    // fill that lands before React finishes hydrating is discarded when the
    // node is re-created, and the form then submits an EMPTY query. Re-apply
    // until the value sticks — this synchronizes on hydration exactly as the
    // shared login helper does; it is not a retry of a failing assertion.
    const term = uniq("nope");
    const searchInput = customer.page.getByTestId("branch-search-input");
    await expect(async () => {
      await searchInput.fill(term);
      await expect(searchInput).toHaveValue(term, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await customer.page.getByTestId("branch-search-submit").click();
    // Wait for the GET form's navigation to land before counting cards, so the
    // assertion cannot read the pre-search page.
    await customer.page.waitForURL(/[?&]search=nope/);
    await expect(customer.page.getByTestId("branch-enabled")).toHaveCount(0);
    await expect(customer.page.getByTestId("branch-search-clear")).toBeVisible();

    // Clearing restores the eligible list with the nearest branch still enabled.
    await customer.page.getByTestId("branch-search-clear").click();
    await customer.page.waitForURL((url) => !url.search.includes("search="));
    await expect(customer.page.getByTestId("branch-enabled").first()).toBeVisible();
    // Exactly one branch is ever enabled — search must not re-enable others.
    await expect(customer.page.getByTestId("branch-enabled")).toHaveCount(1);
  });

  test("product search is branch-scoped and honours the search term", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const bm = await branchMap(admin.req);
    const main = bm["Main Branch"];
    const other = Object.values(bm).find((id) => id !== main)!;

    const mine = await (await makeProduct(admin.req, main, "THICK", { name: uniq("ScopedItem") })).json();
    const theirs = await (await makeProduct(admin.req, other, "THICK", { name: uniq("OtherItem") })).json();

    const { results } = await (await customer.req.get(`${API_BASE}/api/products/?branch=${main}&search=${encodeURIComponent(mine.name)}`)).json();
    expect(results.some((p: { id: number }) => p.id === mine.id), "search term honoured").toBe(true);
    expect(results.some((p: { id: number }) => p.id === theirs.id), "other branch excluded").toBe(false);
  });
});

// ── REQ #7 / #10 — nearest branch + delivery-area validation ──────────────
test.describe("#7/#10 nearest branch + delivery area validation", () => {
  test("nearest-branch is server-computed and deterministic; only one branch is eligible", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    await customer.req.post(`${API_BASE}/api/customer/location`, { data: INSIDE });

    const first = await (await customer.req.get(`${API_BASE}/api/customer/nearest-branch`)).json();
    const second = await (await customer.req.get(`${API_BASE}/api/customer/nearest-branch`)).json();
    expect(first.nearest?.id, "deterministic result").toBe(second.nearest?.id);
    expect(first.branches.filter((b: { eligible: boolean }) => b.eligible).length).toBe(1);
  });

  test("another branch's delivery area cannot be used, and invalid coordinates are refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    await seedCustomerLocation(customer.req);
    const bm = await branchMap(admin.req);
    const main = bm["Main Branch"];
    const other = Object.values(bm).find((id) => id !== main)!;
    const { results: products } = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${main}&page_size=50`)).json();
    const product = products.find((p: { variation_type: string }) => p.variation_type !== "BOTH") ?? products[0];

    const foreignArea = await (await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: other, name: uniq("ForeignArea"), estimated_delivery_minutes: 30, delivery_charge: 20 },
    })).json();

    const base = {
      branch_id: main, payment_method: "cash", delivery_address: "Area test, Dhaka",
      fulfillment_type: "delivery",
      items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
    };

    // Foreign area → rejected.
    expect((await customer.req.post(`${API_BASE}/api/orders/`, { data: { ...base, ...INSIDE, delivery_area_id: foreignArea.id } })).status()).toBe(400);
    // Outside coverage → rejected.
    expect((await customer.req.post(`${API_BASE}/api/orders/`, { data: { ...base, ...OUTSIDE } })).status()).toBe(400);
    // Invalid coordinates → rejected.
    expect((await customer.req.post(`${API_BASE}/api/orders/`, { data: { ...base, lat: 999, lng: 999 } })).status()).toBe(400);
  });
});
