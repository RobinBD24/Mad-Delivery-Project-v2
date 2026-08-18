import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE 9 / PHASE 16 — regression cover for the reported "Something went wrong /
 * Could not load data" pages.
 *
 * Root cause (proven): the Round-5 migration added `Product.variationType`,
 * `OrderItem.variationType` and the Category status-audit columns, but had been
 * applied to the test database only. The running build therefore SELECTed
 * columns the target database did not have, and Prisma raised
 * `The column main.Product.variationType does not exist in the current database`
 * — surfacing as the generic boundary with error refs on every page that reads
 * products, categories, orders or order items:
 *   Ref 1785202134 (dashboard) · 2332199718 (products) · 2088603668 (categories)
 *   Ref 1660125826 (orders)    · 1544635164 (reports)  · 4160909269 (BM catalog)
 *
 * These tests assert the real pages/APIs load real data, behave correctly when a
 * dataset is legitimately EMPTY (empty state, not an error), and still enforce
 * authorization. They fail loudly if schema drift ever reappears.
 */

const PAGES_SUPER_ADMIN = [
  { name: "dashboard", path: "/admin/dashboard" },
  { name: "products", path: "/admin/products" },
  { name: "categories", path: "/admin/categories" },
  { name: "orders", path: "/admin/orders" },
  { name: "reports", path: "/admin/reports" },
];

/** The boundary copy that must never appear on a healthy page. */
const ERROR_MARKERS = [
  "Something went wrong",
  "Could not load data",
  "Couldn't load data",
  "কিছু একটা ভুল হয়েছে",
];

async function expectNoErrorBoundary(body: string, label: string) {
  for (const marker of ERROR_MARKERS) {
    expect(body, `${label} must not render "${marker}"`).not.toContain(marker);
  }
}

test.describe("Phase 9 — super admin data-loading pages", () => {
  for (const page of PAGES_SUPER_ADMIN) {
    test(`${page.name} loads real data without the error boundary`, async ({ browser }) => {
      const admin = await newSession(browser, "super_admin");
      const res = await admin.page.goto(page.path);
      expect(res?.status(), `${page.name} HTTP status`).toBeLessThan(400);
      await expect(admin.page.locator("main")).toBeVisible();
      await expectNoErrorBoundary(await admin.page.locator("body").innerText(), page.name);
    });
  }

  test("the underlying APIs return data (not a 500) for every affected model", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    for (const path of ["/api/products/?page_size=5", "/api/categories/?page_size=5", "/api/orders/?page_size=5"]) {
      const res = await admin.req.get(`${API_BASE}${path}`);
      expect(res.status(), `${path} must not error`).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.results), `${path} returns a results array`).toBe(true);
    }
  });

  test("order items expose the crust snapshot column that previously broke the query", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { results } = await (await admin.req.get(`${API_BASE}/api/orders/?page_size=5`)).json();
    // Reading order items is exactly what failed before; assert it resolves.
    for (const order of results as { id: number }[]) {
      const detail = await admin.req.get(`${API_BASE}/api/orders/${order.id}/`);
      expect(detail.status()).toBe(200);
      const body = await detail.json();
      expect(Array.isArray(body.items)).toBe(true);
      for (const item of body.items) {
        expect(item, "order item carries its variation_type snapshot field").toHaveProperty("variation_type");
      }
    }
  });

  test("unauthorized roles are refused, not shown an error boundary", async ({ browser }) => {
    for (const role of ["customer", "rider"]) {
      const s = await apiLogin(browser, role);
      // Category mutation stays super-admin only.
      const res = await s.req.post(`${API_BASE}/api/categories/`, { data: { name: "nope" } });
      expect(res.status(), `${role} cannot create a category`).toBe(403);
      await s.context.close();
    }
  });
});

test.describe("Phase 16 — branch manager catalog", () => {
  test("catalog loads own-branch data without the error boundary", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const res = await bm.page.goto("/branch-manager/catalog");
    expect(res?.status()).toBeLessThan(400);
    await expect(bm.page.locator("main")).toBeVisible();
    await expectNoErrorBoundary(await bm.page.locator("body").innerText(), "BM catalog");
  });

  test("catalog APIs are scoped to the manager's own branch", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const res = await bm.req.get(`${API_BASE}/api/products/?page_size=100`);
    expect(res.status()).toBe(200);
    const { results } = await res.json();
    for (const p of results as { branch: number }[]) {
      expect(p.branch, "branch manager only sees own-branch products").toBe(own);
    }
  });

  test("an empty result renders an empty state rather than an error", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // A brand-new branch has no products; its scoped catalogue must be empty, not broken.
    const created = await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: `EmptyCat-${Date.now()}`,
        address: "Empty Rd, Dhaka",
        phone: `017${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: "cheez",
      },
    });
    expect(created.status()).toBe(201);
    const branch = await created.json();
    const res = await admin.req.get(`${API_BASE}/api/products/?branch_id=${branch.id}&page_size=50`);
    expect(res.status(), "empty dataset is a 200, not an error").toBe(200);
    expect((await res.json()).results.length).toBe(0);
  });
});

/**
 * Schema-drift guard: every column the Prisma client SELECTs must exist in the
 * database the app is pointed at. Hitting each model through the API is the
 * cheapest end-to-end proof (a missing column raises a Prisma error → non-200).
 */
test.describe("schema drift guard", () => {
  test("every core model can be queried through its API", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const endpoints = [
      "/api/products/?page_size=1",
      "/api/categories/?page_size=1",
      "/api/orders/?page_size=1",
      "/api/branches/?page_size=1",
      "/api/delivery-areas/?page_size=1",
    ];
    const failures: string[] = [];
    for (const path of endpoints) {
      const res: Awaited<ReturnType<APIRequestContext["get"]>> = await admin.req.get(`${API_BASE}${path}`);
      if (res.status() !== 200) failures.push(`${path} -> ${res.status()}`);
    }
    expect(failures, "no model may fail to query (schema drift)").toEqual([]);
  });
});
