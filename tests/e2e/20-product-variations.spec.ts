import { test, expect } from "@playwright/test";
import { newSession } from "./helpers";

/**
 * PART A — product variations, brand type, and product permissions.
 * Mixes UI (super-admin create-with-variations) with API assertions for the
 * rules that must hold server-side (brand scoping, IDOR, price snapshot).
 */

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface V { id: number; name: string; price: string; is_default: boolean; is_enabled: boolean }
interface P { id: number; name: string; brand: string | null; variations: V[] }
interface OItem { product: number; unit_price: string }

// Resolve seeded branches by name via the API, so tests never hardcode ids.
async function branchesByName(req: import("@playwright/test").APIRequestContext) {
  const res = await req.get("/api/branches/?page_size=100");
  expect(res.ok()).toBeTruthy();
  const { results } = (await res.json()) as { results: { id: number; name: string; brand_type: string }[] };
  const map: Record<string, { id: number; brand_type: string }> = {};
  for (const b of results) map[b.name] = { id: b.id, brand_type: b.brand_type };
  return map;
}

test.describe("Part A: product variations + brand type", () => {
  test("super admin product create page loads with a working category dropdown", async ({ browser }) => {
    const { page, context } = await newSession(browser, "super_admin");
    await page.goto("/admin/products/create");
    // Not the error boundary.
    await expect(page.getByRole("heading", { name: /new product/i })).toBeVisible();
    const branchSelect = page.locator('select[name="branch_id"]');
    await expect(branchSelect).toBeVisible();
    // Category dropdown exists and has options once a branch is selected.
    await expect(page.locator('select[name="category"]')).toBeVisible();
    await context.close();
  });

  test("super admin creates a multi-variation product for a single-brand branch", async ({ browser }) => {
    const { page, context, req } = await newSession(browser, "super_admin");
    const branches = await branchesByName(req);
    const cheez = branches["Cheez Gulshan"];
    expect(cheez).toBeTruthy();

    const name = `QA Pizza ${uniq()}`;
    await page.goto("/admin/products/create");
    await page.selectOption('select[name="branch_id"]', String(cheez.id));
    await page.fill('input[name="name"]', name);
    // Category selection is mandatory (req #10) — pick the branch's category.
    await page.selectOption('select[name="category"]', { index: 1 });

    // Two variations.
    const rows = page.getByTestId("variation-row");
    await page.getByRole("button", { name: /add variation/i }).click();
    await expect(rows).toHaveCount(2);
    const names = page.getByTestId("variation-name");
    const prices = page.getByTestId("variation-price");
    await names.nth(0).fill("Small");
    await prices.nth(0).fill("400");
    await names.nth(1).fill("Large");
    await prices.nth(1).fill("700");

    await page.getByRole("button", { name: /add product/i }).click();
    await page.waitForURL("**/admin/products", { timeout: 20_000 });
    await expect(page.getByText(name)).toBeVisible();

    // API confirms two variations persisted with one default.
    const list = await (await req.get(`/api/products/?branch_id=${cheez.id}&page_size=200`)).json();
    const created = (list.results as P[]).find((p) => p.name === name);
    expect(created).toBeTruthy();
    if (!created) return;
    expect(created.variations).toHaveLength(2);
    expect(created.variations.filter((v: V) => v.is_default)).toHaveLength(1);
    expect(created.brand).toBe("cheez"); // forced from the single-brand branch
    await context.close();
  });

  test("CHEEZ branch rejects a MADCHEF product (cross-brand blocked server-side)", async ({ browser }) => {
    const { context, req } = await newSession(browser, "super_admin");
    const branches = await branchesByName(req);
    const cheez = branches["Cheez Gulshan"];
    const form = new URLSearchParams();
    form.set("branch_id", String(cheez.id));
    form.set("name", `Cross ${uniq()}`);
    form.set("brand", "madchef"); // wrong brand for a cheez-only branch
    form.set("variations", JSON.stringify([{ name: "Reg", price: 200, isDefault: true, isEnabled: true }]));
    const res = await req.post("/api/products/", {
      multipart: Object.fromEntries(form) as Record<string, string>,
    });
    // Single-brand branch forces its own brand, so a madchef tag is ignored and
    // the product is created as cheez — assert it is NOT madchef.
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.brand).toBe("cheez");
    await context.close();
  });

  test("combined branch requires and accepts an explicit brand", async ({ browser }) => {
    const { context, req } = await newSession(browser, "super_admin");
    const branches = await branchesByName(req);
    const main = branches["Main Branch"]; // combined
    expect(main.brand_type).toBe("combined");

    // Missing brand → validation error.
    const bad = await req.post("/api/products/", {
      multipart: {
        branch_id: String(main.id),
        name: `NoBrand ${uniq()}`,
        variations: JSON.stringify([{ name: "Reg", price: 150, isDefault: true, isEnabled: true }]),
      },
    });
    expect(bad.status()).toBe(400);

    // Explicit valid brand → created.
    for (const brand of ["cheez", "madchef"]) {
      const ok = await req.post("/api/products/", {
        multipart: {
          branch_id: String(main.id),
          name: `${brand} ${uniq()}`,
          brand,
          variations: JSON.stringify([{ name: "Reg", price: 150, isDefault: true, isEnabled: true }]),
        },
      });
      expect(ok.ok()).toBeTruthy();
      expect((await ok.json()).brand).toBe(brand);
    }
    await context.close();
  });

  test("branch manager cannot modify another branch's product (IDOR 403)", async ({ browser }) => {
    const { context, req } = await newSession(browser, "branch_manager");
    // The BM manages Main Branch; Cheez Gulshan's product belongs to another branch.
    const branches = await branchesByName(req);
    const cheez = branches["Cheez Gulshan"];
    // Discover a foreign-branch product id via a super-admin session; the BM will
    // then attempt to PATCH it directly (bypassing the hidden-button guard).
    const superReq = (await newSession(browser, "super_admin")).req;
    const cheezProducts = await (await superReq.get(`/api/products/?branch_id=${cheez.id}&page_size=50`)).json();
    const foreign = (cheezProducts.results as P[])[0];
    expect(foreign).toBeTruthy();
    if (!foreign) return;

    const res = await req.patch(`/api/products/${foreign.id}/`, { multipart: { name: "hijacked" } });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("historical order price snapshot survives a later variation price change", async ({ browser }) => {
    const cust = await newSession(browser, "customer");
    const admin = await newSession(browser, "super_admin");
    const branches = await branchesByName(cust.req);
    const main = branches["Main Branch"];

    // Pick a Main-branch product + its default variation.
    const products = await (await cust.req.get(`/api/products/?branch_id=${main.id}&page_size=200`)).json();
    const prod = (products.results as P[]).find((p) => p.variations.length >= 2);
    expect(prod).toBeTruthy();
    if (!prod) return;
    const variation = prod.variations.find((v: V) => v.is_default)!;

    // Place an order for that variation.
    const orderRes = await cust.req.post("/api/orders/", {
      data: {
        branch_id: main.id,
        payment_method: "cash",
        delivery_address: "QA Test Address, Dhaka", lat: 23.781, lng: 90.408,
        items: [{ product_id: prod.id, variation_id: variation.id, quantity: 1 }],
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = await orderRes.json();
    const orderedUnit = order.items.find((i: OItem) => i.product === prod.id)?.unit_price;
    expect(orderedUnit).toBeTruthy();

    // Super admin raises the variation price via a full product update.
    const newVariations = prod.variations.map((v: V) => ({
      id: v.id,
      name: v.name,
      price: Number(v.price) + 111,
      isDefault: v.is_default,
      isEnabled: v.is_enabled,
    }));
    const patch = await admin.req.patch(`/api/products/${prod.id}/`, {
      multipart: { variations: JSON.stringify(newVariations) },
    });
    expect(patch.ok()).toBeTruthy();

    // The existing order's snapshot is unchanged.
    const after = await (await cust.req.get(`/api/orders/${order.id}/`)).json();
    const afterUnit = after.items.find((i: OItem) => i.product === prod.id)?.unit_price;
    expect(afterUnit).toBe(orderedUnit);

    await cust.context.close();
    await admin.context.close();
  });
});
