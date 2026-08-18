import { test, expect, type APIRequestContext } from "@playwright/test";
import { newSession } from "./helpers";

/**
 * NEW FEATURES (this round):
 *  #15 unique order number (format, monotonic, concurrency-safe)
 *  #4  super-admin-only product soft delete (history-safe, BM/other 403)
 *  #7  category mutation is super-admin-only (BM/other 403)
 *  #8  global vs branch category scope + scoped duplicate prevention
 *  #10 branch product forms see own-branch + global categories, never other branches
 *  #3  global company logo — super-admin-only upload/replace/remove
 *  #2  server-side branch coordinate validation (raw lat/lng removed from UI)
 *
 * Server rules are the source of truth, so they're asserted at the API layer;
 * a couple of UI smoke checks confirm pages render + the lat/lng fields are gone.
 */

const INSIDE = { lat: 23.781, lng: 90.408 }; // inside Main Branch coverage
const uniqName = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get("/api/branches/?page_size=100")).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

async function firstProduct(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`/api/products/?branch_id=${branchId}&page_size=50`)).json();
  return results[0] as { id: number };
}

async function placeOrder(req: APIRequestContext, branchId: number, productId: number) {
  const res = await req.post("/api/orders/", {
    data: {
      branch_id: branchId,
      payment_method: "cash",
      delivery_address: "Dhanmondi, Dhaka",
      fulfillment_type: "delivery",
      lat: INSIDE.lat,
      lng: INSIDE.lng,
      items: [{ product_id: productId, quantity: 1 }],
    },
  });
  return res;
}

// ── #15 Unique order number ───────────────────────────────────────────────
test.describe("#15 unique order number", () => {
  test("new orders get an ORD-YYYYMMDD-###### number, monotonic", async ({ browser }) => {
    const { context, req } = await newSession(browser, "customer");
    const main = (await branchMap(req))["Main Branch"];
    const prod = await firstProduct(req, main);
    const a = await (await placeOrder(req, main, prod.id)).json();
    const b = await (await placeOrder(req, main, prod.id)).json();
    expect(a.order_number).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(b.order_number).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(a.order_number).not.toBe(b.order_number);
    const seqA = Number(a.order_number.split("-")[2]);
    const seqB = Number(b.order_number.split("-")[2]);
    expect(seqB).toBeGreaterThan(seqA);
    await context.close();
  });

  test("concurrent orders never collide on the number", async ({ browser }) => {
    const { context, req } = await newSession(browser, "customer");
    const main = (await branchMap(req))["Main Branch"];
    const prod = await firstProduct(req, main);
    const results = await Promise.all(Array.from({ length: 6 }, () => placeOrder(req, main, prod.id)));
    const numbers = await Promise.all(results.map(async (r) => (await r.json()).order_number as string));
    for (const n of numbers) expect(n).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(new Set(numbers).size).toBe(numbers.length); // all unique
    await context.close();
  });
});

// ── #4 Super-admin product delete (soft, history-safe) ────────────────────
test.describe("#4 product delete", () => {
  async function createProduct(req: APIRequestContext, branchId: number) {
    const cats = await (await req.get(`/api/categories/?branch_id=${branchId}&page_size=50`)).json();
    const categoryId = cats.results[0].id;
    const res = await req.post("/api/products/", {
      data: {
        branch_id: branchId,
        name: uniqName("DelTest"),
        brand: "cheez",
        category: categoryId,
        is_available: true,
        variations: JSON.stringify([{ name: "Std", price: 150, isDefault: true, isEnabled: true }]),
      },
    });
    return res;
  }

  test("super admin soft-deletes; product hidden but historical order intact", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const created = await createProduct(admin.req, main);
    expect(created.status()).toBe(201);
    const product = await created.json();

    // A customer places an order for it (history).
    const cust = await newSession(browser, "customer");
    const orderRes = await placeOrder(cust.req, main, product.id);
    expect(orderRes.status()).toBe(201);
    const order = await orderRes.json();

    // Super admin deletes the product.
    const del = await admin.req.delete(`/api/products/${product.id}/`);
    expect(del.status()).toBe(200);

    // It disappears from the catalog list…
    const list = await (await admin.req.get(`/api/products/?branch_id=${main}&page_size=200`)).json();
    expect((list.results as { id: number }[]).some((p) => p.id === product.id)).toBe(false);

    // …but the historical order still reads with its item.
    const readBack = await (await cust.req.get(`/api/orders/${order.id}/`)).json();
    expect(readBack.items.some((i: { product: number }) => i.product === product.id)).toBe(true);

    await admin.context.close();
    await cust.context.close();
  });

  test("branch manager and customer cannot delete a product (403)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const prod = await firstProduct(admin.req, main);

    const bm = await newSession(browser, "branch_manager");
    expect((await bm.req.delete(`/api/products/${prod.id}/`)).status()).toBe(403);

    const cust = await newSession(browser, "customer");
    expect((await cust.req.delete(`/api/products/${prod.id}/`)).status()).toBe(403);

    // The product is still there (not deleted by the forbidden attempts).
    const still = await (await admin.req.get(`/api/products/?branch_id=${main}&page_size=200`)).json();
    expect((still.results as { id: number }[]).some((p) => p.id === prod.id)).toBe(true);

    await admin.context.close();
    await bm.context.close();
    await cust.context.close();
  });
});

// ── #7/#8/#10 Category permissions + scope ────────────────────────────────
test.describe("#7/#8/#10 categories", () => {
  test("super admin creates global + branch categories; scope duplicate blocked", async ({ browser }) => {
    const { context, req } = await newSession(browser, "super_admin");
    const main = (await branchMap(req))["Main Branch"];

    const globalName = uniqName("Global");
    const g = await req.post("/api/categories/", { data: { name: globalName, branch_id: "global" } });
    expect(g.status()).toBe(201);
    const gBody = await g.json();
    expect(gBody.is_global).toBe(true);
    expect(gBody.branch).toBeNull();

    // Duplicate global name in the same scope → 400.
    const dup = await req.post("/api/categories/", { data: { name: globalName.toUpperCase(), branch_id: "global" } });
    expect(dup.status()).toBe(400);

    // Same name but scoped to a branch is a DIFFERENT scope → allowed.
    const scoped = await req.post("/api/categories/", { data: { name: globalName, branch_id: main } });
    expect(scoped.status()).toBe(201);
    expect((await scoped.json()).branch).toBe(main);

    await context.close();
  });

  test("branch manager cannot create/edit/delete categories (403)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const cat = await (await admin.req.post("/api/categories/", { data: { name: uniqName("SA"), branch_id: main } })).json();

    const bm = await newSession(browser, "branch_manager");
    expect((await bm.req.post("/api/categories/", { data: { name: uniqName("BM"), branch_id: main } })).status()).toBe(403);
    expect((await bm.req.patch(`/api/categories/${cat.id}/`, { data: { name: "Hacked" } })).status()).toBe(403);
    expect((await bm.req.delete(`/api/categories/${cat.id}/`)).status()).toBe(403);

    await admin.context.close();
    await bm.context.close();
  });

  test("#10 branch forms see own-branch + global categories, not other branches", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bmap = await branchMap(admin.req);
    const otherName = Object.keys(bmap).find((n) => n !== "Main Branch")!;
    const other = bmap[otherName];

    const globalCat = await (await admin.req.post("/api/categories/", { data: { name: uniqName("Glob"), branch_id: "global" } })).json();
    const otherCat = await (await admin.req.post("/api/categories/", { data: { name: uniqName("Other"), branch_id: other } })).json();

    // Branch manager (Main Branch) sees the global category but NOT the other branch's.
    const bm = await newSession(browser, "branch_manager");
    const bmCats = await (await bm.req.get("/api/categories/?page_size=200")).json();
    const bmIds = (bmCats.results as { id: number }[]).map((c) => c.id);
    expect(bmIds).toContain(globalCat.id);
    expect(bmIds).not.toContain(otherCat.id);

    // Creating a product with another branch's category is rejected server-side.
    const cross = await bm.req.post("/api/products/", {
      data: {
        name: uniqName("Cross"),
        category: otherCat.id,
        variations: JSON.stringify([{ name: "Std", price: 100, isDefault: true, isEnabled: true }]),
      },
    });
    expect(cross.status()).toBe(400);

    await admin.context.close();
    await bm.context.close();
  });
});

// ── #3 Global company logo ────────────────────────────────────────────────
test.describe("#3 global company logo", () => {
  test("only super admin can read/upload/remove the logo", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    expect((await bm.req.get("/api/admin/settings/logo")).status()).toBe(403);
    // multipart upload attempt by BM → 403 before any file processing
    expect((await bm.req.post("/api/admin/settings/logo", { multipart: { logo: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0]) } } })).status()).toBe(403);
    await bm.context.close();

    const admin = await newSession(browser, "super_admin");
    const get = await admin.req.get("/api/admin/settings/logo");
    expect(get.status()).toBe(200);
    expect(await get.json()).toHaveProperty("url");
    await admin.context.close();
  });
});

// ── #2 Branch coordinate validation + no raw lat/lng UI ───────────────────
test.describe("#2 branch coordinates", () => {
  test("server rejects invalid coordinates", async ({ browser }) => {
    const { context, req } = await newSession(browser, "super_admin");
    const bad = await req.post("/api/branches/", {
      multipart: {
        name: uniqName("BadBranch"),
        address: "Somewhere",
        phone: "01712345678",
        brand_type: "combined",
        latitude: "999",
        longitude: "500",
      },
    });
    expect(bad.status()).toBe(400);
    await context.close();
  });

  test("branch create page renders without raw lat/lng text fields", async ({ browser }) => {
    const { context, page } = await newSession(browser, "super_admin");
    await page.goto("/admin/branches/create");
    // The latitude input, if present, must be hidden (not a visible text field).
    const lat = page.locator('input[name="latitude"]');
    if (await lat.count()) await expect(lat).toBeHidden();
    const lng = page.locator('input[name="longitude"]');
    if (await lng.count()) await expect(lng).toBeHidden();
    await context.close();
  });
});
