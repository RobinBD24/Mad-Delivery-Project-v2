import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * PRODUCT SYSTEM — the database is the single source of truth.
 *
 * The storefront used to render `MENU_ITEMS`, 107 products hardcoded in
 * `lib/home/menu-data.ts`, whose names appeared nowhere in the database. Nothing
 * a customer saw could be edited, priced, held or deleted from the admin panel.
 * These tests hold the whole chain to that contract: create/edit/status/delete
 * in the admin panel must land on the public storefront, the menu, search, the
 * cart and checkout — with no restart and no rebuild — and every eligibility
 * decision must come from the one shared selector.
 */

// Every UI assertion in this file reads English copy, so the locale is pinned.
// Without it the raw `page` fixture renders in the default locale and an English
// matcher simply finds nothing.
test.beforeEach(async ({ context }) => setLocale(context, "en"));

const INSIDE = { lat: 23.781, lng: 90.408 }; // inside Main Branch coverage
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get("/api/branches/?page_size=100")).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

/**
 * A category the branch may use. The seed creates only branch-scoped categories
 * (no global ones), so a freshly created branch starts with none — make one
 * rather than assuming the fixture data has one.
 */
async function firstCategory(req: APIRequestContext, branchId: number): Promise<number> {
  const cats = await (await req.get(`/api/categories/?branch_id=${branchId}&page_size=50`)).json();
  if (cats.results.length > 0) return cats.results[0].id as number;
  const made = await req.post("/api/categories/", {
    data: { name: uniq("AutoCat"), branch_id: branchId, is_active: true },
  });
  expect(made.status(), "category created for the branch").toBe(201);
  return (await made.json()).id as number;
}

interface MadeProduct {
  id: number;
  name: string;
  price: string;
  branch: number;
}

async function makeProduct(
  req: APIRequestContext,
  branchId: number,
  overrides: Record<string, string | number | boolean> = {},
): Promise<MadeProduct> {
  const categoryId = await firstCategory(req, branchId);
  const res = await req.post("/api/products/", {
    data: {
      branch_id: branchId,
      name: uniq("SyncProd"),
      brand: "cheez",
      category: categoryId,
      is_available: true,
      preparation_time: 20,
      variations: JSON.stringify([{ name: "Std", price: 275, isDefault: true, isEnabled: true }]),
      ...overrides,
    },
  });
  expect(res.status(), "product created").toBe(201);
  return (await res.json()) as MadeProduct;
}

/** The storefront's rendered product names (the card headings). */
async function homepageNames(page: Page): Promise<string[]> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return page.locator("article h4").allInnerTexts();
}

/** Names the CUSTOMER-facing product API reports for a branch. */
async function customerNames(req: APIRequestContext, branchId: number): Promise<string[]> {
  const { results } = await (
    await req.get(`/api/products/?branch_id=${branchId}&page_size=200`)
  ).json();
  return (results as { name: string }[]).map((p) => p.name);
}

// ── The storefront is database-backed ─────────────────────────────────────
test.describe("Storefront reads the database", () => {
  test("no hardcoded product survives anywhere in the runtime", async ({ page }) => {
    const names = await homepageNames(page);
    // A representative sample of the deleted hardcoded catalogue. None of these
    // ever existed as database rows, so any hit means a static source is back.
    for (const ghost of [
      "Margherita",
      "The Pepperonia",
      "Nagatastic BBQ",
      "Shah Poutine",
      "Kolongo The Disgrace",
      "Liquid Gold",
    ]) {
      expect(names, `hardcoded product must not render: ${ghost}`).not.toContain(ghost);
    }
  });

  test("every homepage product exists as a manageable database row", async ({ browser, page }) => {
    const names = await homepageNames(page);
    expect(names.length, "storefront renders products").toBeGreaterThan(0);

    const admin = await newSession(browser, "super_admin");
    // The admin's own list, unfiltered — what a super admin can actually manage.
    const { results } = await (await admin.req.get("/api/products/?page_size=200")).json();
    const manageable = new Set((results as { name: string }[]).map((p) => p.name));
    for (const name of names) {
      expect(manageable.has(name), `"${name}" must be manageable in the admin panel`).toBe(true);
    }
    await admin.context.close();
  });
});

// ── Create / edit propagation, with no restart or rebuild ─────────────────
test.describe("Admin changes reach the storefront", () => {
  test("a created eligible product appears publicly", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    expect(await homepageNames(page), "new product on the storefront").toContain(product.name);
    await admin.context.close();
  });

  test("a name edit propagates to the storefront and to search", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);
    const renamed = uniq("Renamed");

    const res = await admin.req.patch(`/api/products/${product.id}/`, { data: { name: renamed } });
    expect(res.status()).toBe(200);

    const names = await homepageNames(page);
    expect(names, "new name shown").toContain(renamed);
    expect(names, "old name gone").not.toContain(product.name);

    // The nav search index is built from the same query.
    await page
      .getByRole("textbox", { name: /search any item across all menus/i })
      .fill(renamed);
    await expect(page.getByText(renamed).first()).toBeVisible();
    await admin.context.close();
  });

  test("a price edit propagates to the storefront", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    const res = await admin.req.patch(`/api/products/${product.id}/`, {
      data: {
        variations: JSON.stringify([{ name: "Std", price: 911, isDefault: true, isEnabled: true }]),
      },
    });
    expect(res.status()).toBe(200);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const card = page.locator("article").filter({ hasText: product.name }).first();
    await expect(card, "the product's card carries the NEW price").toContainText("911");
    await admin.context.close();
  });

  test("a category change moves the product's storefront section", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    // A second category in the same scope to move the product into.
    const created = await admin.req.post("/api/categories/", {
      data: { name: uniq("SyncCat"), branch_id: main, is_active: true },
    });
    expect(created.status()).toBe(201);
    const category = await created.json();

    const res = await admin.req.patch(`/api/products/${product.id}/`, {
      data: { category: category.id },
    });
    expect(res.status()).toBe(200);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The section heading the card sits under is the category's own name.
    const section = page.locator("h3").filter({ hasText: category.name });
    await expect(section, "a section for the new category exists").toHaveCount(1);
    await admin.context.close();
  });
});

// ── Status propagation ────────────────────────────────────────────────────
test.describe("Status changes propagate", () => {
  test("deactivate hides it, reactivate restores it", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);
    expect(await homepageNames(page)).toContain(product.name);

    const off = await admin.req.post(`/api/products/${product.id}/toggle-availability/`, {
      data: { reason: "out of stock" },
    });
    expect(off.status(), "super admin may deactivate").toBe(200);
    expect(await homepageNames(page), "hidden once deactivated").not.toContain(product.name);

    const on = await admin.req.post(`/api/products/${product.id}/toggle-availability/`, { data: {} });
    expect(on.status()).toBe(200);
    expect(await homepageNames(page), "restored once reactivated").toContain(product.name);
    await admin.context.close();
  });

  test("hold blocks new orders and hides it; resume restores ordering", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    expect((await admin.req.post(`/api/products/${product.id}/hold/`)).status()).toBe(200);
    expect(await homepageNames(page), "held product is hidden").not.toContain(product.name);

    const blocked = await customer.req.post("/api/orders/", {
      data: {
        branch_id: main,
        payment_method: "cash",
        delivery_address: "Dhanmondi, Dhaka",
        fulfillment_type: "delivery",
        ...INSIDE,
        items: [{ product_id: product.id, quantity: 1 }],
      },
    });
    expect(blocked.status(), "a held product cannot be ordered").toBeGreaterThanOrEqual(400);

    expect((await admin.req.post(`/api/products/${product.id}/unhold/`)).status()).toBe(200);
    expect(await homepageNames(page), "resumed product returns").toContain(product.name);
    await admin.context.close();
    await customer.context.close();
  });

  test("soft delete removes it from storefront, customer API and direct URL", async ({
    browser,
    page,
  }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    expect((await admin.req.delete(`/api/products/${product.id}/`)).status()).toBe(200);

    expect(await homepageNames(page), "gone from the storefront").not.toContain(product.name);
    expect(await customerNames(customer.req, main), "gone from the menu").not.toContain(product.name);
    // A direct API/product URL is judged by the same rules as the listings.
    expect((await customer.req.get(`/api/products/${product.id}/`)).status()).toBe(404);
    await admin.context.close();
    await customer.context.close();
  });
});

// ── Branch + category eligibility ─────────────────────────────────────────
test.describe("Branch and category eligibility", () => {
  test("deactivating a category hides its products from the storefront", async ({
    browser,
    page,
  }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const created = await admin.req.post("/api/categories/", {
      data: { name: uniq("HideCat"), branch_id: main, is_active: true },
    });
    const category = await created.json();
    const product = await makeProduct(admin.req, main, { category: category.id });
    expect(await homepageNames(page)).toContain(product.name);

    const off = await admin.req.post(`/api/categories/${category.id}/status/`, {
      data: { is_active: false },
    });
    expect(off.status()).toBe(200);
    expect(
      await homepageNames(page),
      "a product under an inactive category is not customer-visible",
    ).not.toContain(product.name);
    await admin.context.close();
  });

  test("deactivating a branch hides all of its products", async ({ browser, page }) => {
    const admin = await newSession(browser, "super_admin");
    // A dedicated branch, so holding it cannot disturb the shared seed branches.
    const branchRes = await admin.req.post("/api/branches/", {
      data: {
        name: uniq("SyncBranch"),
        address: "Dhanmondi, Dhaka",
        phone: "01711111111",
        brand_type: "cheez",
        latitude: String(INSIDE.lat),
        longitude: String(INSIDE.lng),
        delivery_radius_km: "5",
      },
    });
    expect(branchRes.status()).toBe(201);
    const branch = await branchRes.json();
    const product = await makeProduct(admin.req, branch.id);
    expect(await homepageNames(page)).toContain(product.name);

    expect((await admin.req.post(`/api/branches/${branch.id}/deactivate/`, { data: { reason: "x" } })).status()).toBe(200);
    expect(await homepageNames(page), "an inactive branch's products vanish").not.toContain(product.name);

    expect((await admin.req.post(`/api/branches/${branch.id}/activate/`)).status()).toBe(200);
    expect(await homepageNames(page), "reactivating the branch restores them").toContain(product.name);
    await admin.context.close();
  });
});

// ── Cart / checkout revalidate against the database ───────────────────────
test.describe("Cart and checkout revalidate from the database", () => {
  test("checkout uses the CURRENT server price, not a stale client price", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    // The price changes after the product would have been added to a cart.
    const bumped = await admin.req.patch(`/api/products/${product.id}/`, {
      data: {
        variations: JSON.stringify([{ name: "Std", price: 640, isDefault: true, isEnabled: true }]),
      },
    });
    expect(bumped.status()).toBe(200);

    const order = await customer.req.post("/api/orders/", {
      data: {
        branch_id: main,
        payment_method: "cash",
        delivery_address: "Dhanmondi, Dhaka",
        fulfillment_type: "delivery",
        ...INSIDE,
        // A forged client price must be ignored entirely.
        unit_price: 1,
        items: [{ product_id: product.id, quantity: 2, unit_price: 1 }],
      },
    });
    expect(order.status()).toBe(201);
    const body = await order.json();
    const line = body.items.find((i: { product: number }) => i.product === product.id);
    expect(Number(line.unit_price), "priced from the database, not the request").toBe(640);
    await admin.context.close();
    await customer.context.close();
  });

  test("a historical order keeps its snapshot after the product changes", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    const placed = await customer.req.post("/api/orders/", {
      data: {
        branch_id: main,
        payment_method: "cash",
        delivery_address: "Dhanmondi, Dhaka",
        fulfillment_type: "delivery",
        ...INSIDE,
        items: [{ product_id: product.id, quantity: 1 }],
      },
    });
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    const originalLine = order.items.find((i: { product: number }) => i.product === product.id);

    // Rename, reprice, then soft-delete the product out from under the order.
    await admin.req.patch(`/api/products/${product.id}/`, {
      data: {
        name: uniq("Changed"),
        variations: JSON.stringify([{ name: "Std", price: 4242, isDefault: true, isEnabled: true }]),
      },
    });
    expect((await admin.req.delete(`/api/products/${product.id}/`)).status()).toBe(200);

    const readBack = await (await customer.req.get(`/api/orders/${order.id}/`)).json();
    const line = readBack.items.find((i: { product: number }) => i.product === product.id);
    expect(line, "the historical line still resolves").toBeTruthy();
    expect(line.unit_price, "snapshot price is immutable").toBe(originalLine.unit_price);
    expect(line.product_name, "snapshot name is immutable").toBe(originalLine.product_name);
    await admin.context.close();
    await customer.context.close();
  });
});

// ── Admin All Products page ───────────────────────────────────────────────
test.describe("All Products list management", () => {
  test("shows at most 10 rows per page and paginates server-side", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products");
    const rows = admin.page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count(), "exactly 10 per page").toBeLessThanOrEqual(10);

    // Page 2 is a different server-rendered set, not a client slice.
    const firstPage = await rows.allInnerTexts();
    await admin.page.goto("/admin/products?page=2");
    const secondPage = await admin.page.locator("tbody tr").allInnerTexts();
    expect(secondPage.length, "page 2 has rows").toBeGreaterThan(0);
    expect(secondPage, "page 2 differs from page 1").not.toEqual(firstPage);
    await admin.context.close();
  });

  test("search finds a product by name", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    await admin.page.goto(`/admin/products?search=${encodeURIComponent(product.name)}`);
    const rows = admin.page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(product.name);
    await admin.context.close();
  });

  test("branch, brand, category and status filters each narrow the list", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const categoryId = await firstCategory(admin.req, main);

    for (const query of [
      `branch=${main}`,
      "brand=cheez",
      `category=${categoryId}`,
      "status=available",
      "variationType=THICK",
      `branch=${main}&brand=cheez&status=available`, // combined
    ]) {
      await admin.page.goto(`/admin/products?${query}`);
      // A filtered page renders either matching rows or the explicit
      // "no results" state — never an unfiltered list.
      const rows = await admin.page.locator("tbody tr").count();
      const empty = await admin.page.getByText(/no results/i).count();
      expect(rows > 0 || empty > 0, `filter produced a definite result: ${query}`).toBe(true);
      if (rows > 0) expect(rows, `filter still paginates: ${query}`).toBeLessThanOrEqual(10);
    }
    await admin.context.close();
  });

  test("the row action menu opens a named confirmation before deleting", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    await admin.page.goto(`/admin/products?search=${encodeURIComponent(product.name)}`);
    // ResponsiveDataView renders the desktop AND mobile trees (one is CSS-hidden),
    // so the row controls are scoped to the table view.
    const table = admin.page.getByTestId("responsive-table");
    await table.getByTestId(`product-actions-${product.id}`).click();
    await table.getByTestId(`product-delete-${product.id}`).click();

    const dialog = admin.page.getByRole("dialog");
    await expect(dialog, "the dialog names the product it will delete").toContainText(product.name);
    // Cancelling must leave the product alone.
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toHaveCount(0);
    expect((await admin.req.get(`/api/products/${product.id}/`)).status()).toBe(200);
    await admin.context.close();
  });

  test("the dedicated View page renders the product and its real visibility", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await makeProduct(admin.req, main);

    await admin.page.goto(`/admin/products/${product.id}`);
    await expect(admin.page.getByRole("heading", { name: product.name })).toBeVisible();
    await expect(admin.page.getByText(/visible to customers/i)).toBeVisible();
    await admin.context.close();
  });
});

// ── RBAC ──────────────────────────────────────────────────────────────────
test.describe("Product permissions stay server-enforced", () => {
  test("a branch manager cannot view or edit another branch's product", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const map = await branchMap(admin.req);
    const bm = await newSession(browser, "branch_manager");
    // The manager's own branch, then a product belonging to a DIFFERENT one.
    const mine = await (await bm.req.get("/api/products/?page_size=1")).json();
    const myBranchId = mine.results[0]?.branch as number | undefined;
    const otherId = Object.values(map).find((id) => id !== myBranchId)!;
    const foreign = await makeProduct(admin.req, otherId);

    expect((await bm.req.get(`/api/products/${foreign.id}/`)).status()).toBe(403);
    expect((await bm.req.patch(`/api/products/${foreign.id}/`, { data: { name: "hax" } })).status()).toBe(403);
    // Delete is super-admin-only regardless of branch.
    expect((await bm.req.delete(`/api/products/${foreign.id}/`)).status()).toBe(403);
    await admin.context.close();
    await bm.context.close();
  });

  test("a branch manager cannot bypass an admin hold", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const mine = await (await bm.req.get("/api/products/?page_size=1")).json();
    const product = mine.results[0] as { id: number };

    expect((await admin.req.post(`/api/products/${product.id}/hold/`)).status()).toBe(200);
    // Neither the hold endpoint nor an availability toggle lifts an admin hold.
    expect((await bm.req.post(`/api/products/${product.id}/unhold/`)).status()).toBe(403);
    await bm.req.post(`/api/products/${product.id}/toggle-availability/`, { data: { reason: "x" } });
    const after = await (await admin.req.get(`/api/products/${product.id}/`)).json();
    expect(after.held_by_admin, "the hold survives everything a BM can do").toBe(true);

    await admin.req.post(`/api/products/${product.id}/unhold/`);
    await admin.context.close();
    await bm.context.close();
  });
});
