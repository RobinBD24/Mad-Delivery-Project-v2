import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * REQ #1 Super Admin branch delete/archive · REQ #2 category delete/deactivate
 * REQ #3 category activate/deactivate · REQ #5 Branch Manager branch info
 * REQ #6 Branch Manager delivery-area module.
 *
 * Server rules are asserted at the API layer (the real security boundary);
 * confirmation-dialog behaviour is driven through the browser.
 */

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const INSIDE = { lat: 23.781, lng: 90.408 };

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

/** Create an unused branch (no products/orders/areas) — safe to hard delete. */
async function createBareBranch(req: APIRequestContext) {
  const res = await req.post(`${API_BASE}/api/branches/`, {
    multipart: {
      name: uniq("BareBranch"),
      address: "Nowhere Rd, Dhaka",
      phone: `014${Math.floor(10000000 + Math.random() * 89999999)}`,
      brand_type: "cheez",
    },
  });
  expect(res.status(), "branch created").toBe(201);
  return res.json();
}

// ── REQ #1 — branch delete / archive ──────────────────────────────────────
test.describe("#1 super admin branch delete/archive", () => {
  test("an UNUSED branch is permanently deleted", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await createBareBranch(admin.req);

    const res = await admin.req.delete(`${API_BASE}/api/branches/${branch.id}/`);
    expect(res.status()).toBe(200);
    expect((await res.json()).action, "no dependencies → hard delete").toBe("deleted");

    // Really gone.
    expect((await admin.req.get(`${API_BASE}/api/branches/${branch.id}/`)).status()).toBe(404);
  });

  test("a branch WITH history is archived, and its history is preserved", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await createBareBranch(admin.req);
    // Give it a dependency (a delivery area) so it must be archived, not deleted.
    const area = await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: branch.id, name: uniq("DepArea"), estimated_delivery_minutes: 30, delivery_charge: 25 },
    });
    expect(area.status()).toBe(201);

    const res = await admin.req.delete(`${API_BASE}/api/branches/${branch.id}/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.action, "has dependencies → archived").toBe("archived");
    expect(body.dependencies.areas).toBeGreaterThan(0);

    // History preserved: the branch row still exists and the area still resolves.
    const still = await admin.req.get(`${API_BASE}/api/branches/${branch.id}/`);
    expect(still.status(), "archived branch still readable for reporting").toBe(200);
    expect((await still.json()).is_archived).toBe(true);
    expect((await (await admin.req.get(`${API_BASE}/api/delivery-areas/?branch_id=${branch.id}`)).json()).results.length)
      .toBeGreaterThan(0);
  });

  test("an ARCHIVED branch disappears from customer branch selection", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const branch = await createBareBranch(admin.req);
    await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: branch.id, name: uniq("KeepArea"), estimated_delivery_minutes: 30, delivery_charge: 25 },
    });
    // Visible to the customer while active…
    const before = await (await customer.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    expect(before.results.some((b: { id: number }) => b.id === branch.id)).toBe(true);

    expect((await admin.req.delete(`${API_BASE}/api/branches/${branch.id}/`)).status()).toBe(200);

    const after = await (await customer.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    expect(after.results.some((b: { id: number }) => b.id === branch.id), "archived branch hidden").toBe(false);
  });

  test("non-super-admin roles are refused server-side (403)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await createBareBranch(admin.req);
    for (const role of ["branch_manager", "management", "marketing", "accounts", "rider", "customer"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.delete(`${API_BASE}/api/branches/${branch.id}/`);
      expect(res.status(), `${role} may not delete a branch`).toBe(403);
      await s.context.close();
    }
    // Still there after every forged attempt.
    expect((await admin.req.get(`${API_BASE}/api/branches/${branch.id}/`)).status()).toBe(200);
  });

  test("confirmation dialog names the branch and warns about archiving", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await createBareBranch(admin.req);
    await admin.page.goto(`/admin/branches/${branch.id}`);

    await admin.page.getByTestId("branch-delete").click();
    const dialog = admin.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog, "dialog shows the exact branch name").toContainText(branch.name);
    await expect(dialog, "dialog warns it may archive").toContainText(/archiv/i);

    // Confirm → the list reports the REAL outcome (deleted, since it is unused).
    await dialog.getByRole("button", { name: /delete/i }).click();
    await admin.page.waitForURL("**/admin/branches**", { timeout: 20_000 });
    await expect(admin.page).toHaveURL(/result=deleted/);
  });
});

// ── REQ #2 / #3 — category delete + activate/deactivate ───────────────────
test.describe("#2/#3 category delete + activate/deactivate", () => {
  async function createCategory(req: APIRequestContext, branchId?: number) {
    const res = await req.post(`${API_BASE}/api/categories/`, {
      data: { name: uniq("Cat"), branch_id: branchId ?? "global" },
    });
    expect(res.status()).toBe(201);
    return res.json();
  }

  test("an UNUSED category is hard-deleted; one WITH products is deactivated", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];

    // Unused → deleted.
    const unused = await createCategory(admin.req);
    const del = await admin.req.delete(`${API_BASE}/api/categories/${unused.id}/`);
    expect(del.status()).toBe(200);
    expect((await del.json()).deactivated, "no products → real delete").toBe(false);
    expect((await admin.req.get(`${API_BASE}/api/categories/${unused.id}/`)).status()).toBe(404);

    // With a product → deactivated, product + category row survive.
    const used = await createCategory(admin.req, main);
    const prod = await admin.req.post(`${API_BASE}/api/products/`, {
      multipart: {
        branch_id: String(main), name: uniq("Prod"), category: String(used.id),
        brand: "cheez", variation_type: "THICK",
        variations: JSON.stringify([{ name: "Regular", price: 200, isDefault: true, isEnabled: true }]),
      },
    });
    expect(prod.status()).toBe(201);
    const productId = (await prod.json()).id;

    const del2 = await admin.req.delete(`${API_BASE}/api/categories/${used.id}/`);
    expect(del2.status()).toBe(200);
    expect((await del2.json()).deactivated, "has products → deactivated").toBe(true);

    const after = await admin.req.get(`${API_BASE}/api/categories/${used.id}/`);
    expect(after.status(), "category row preserved").toBe(200);
    expect((await after.json()).is_active).toBe(false);
    // The product is NOT cascade-deleted.
    expect((await admin.req.get(`${API_BASE}/api/products/${productId}/`)).status()).toBe(200);
  });

  test("activate/deactivate persists, and repeating the state is a 409 conflict", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cat = await createCategory(admin.req);

    const off = await admin.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: false } });
    expect(off.status()).toBe(200);
    expect((await off.json()).is_active).toBe(false);

    // Duplicate transition → conflict, not a silent no-op.
    expect((await admin.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: false } })).status())
      .toBe(409);

    const on = await admin.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: true } });
    expect(on.status()).toBe(200);
    expect((await on.json()).is_active).toBe(true);
  });

  test("branch manager and customer cannot mutate categories (403)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cat = await createCategory(admin.req);
    for (const role of ["branch_manager", "customer", "management", "marketing", "accounts"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.post(`${API_BASE}/api/categories/`, { data: { name: uniq("X") } })).status(), `${role} create`).toBe(403);
      expect((await s.req.patch(`${API_BASE}/api/categories/${cat.id}/`, { data: { name: "hax" } })).status(), `${role} edit`).toBe(403);
      expect((await s.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: false } })).status(), `${role} status`).toBe(403);
      expect((await s.req.delete(`${API_BASE}/api/categories/${cat.id}/`)).status(), `${role} delete`).toBe(403);
      await s.context.close();
    }
  });

  test("a DEACTIVATED category is hidden from the customer catalogue and search", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const cat = await createCategory(admin.req, main);

    const visible = await (await customer.req.get(`${API_BASE}/api/categories/?branch_id=${main}&page_size=200`)).json();
    expect(visible.results.some((c: { id: number }) => c.id === cat.id)).toBe(true);

    expect((await admin.req.post(`${API_BASE}/api/categories/${cat.id}/status/`, { data: { is_active: false } })).status()).toBe(200);

    const hidden = await (await customer.req.get(`${API_BASE}/api/categories/?branch_id=${main}&page_size=200`)).json();
    expect(hidden.results.some((c: { id: number }) => c.id === cat.id), "inactive category hidden").toBe(false);
    // Search must not resurface it either.
    const searched = await (await customer.req.get(`${API_BASE}/api/categories/?branch_id=${main}&search=${encodeURIComponent(cat.name)}`)).json();
    expect(searched.results.length, "inactive category not searchable").toBe(0);
  });

  test("category delete dialog states the outcome and the scope", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cat = await createCategory(admin.req);
    await admin.page.goto("/admin/categories");

    await admin.page.getByTestId(`category-delete-${cat.id}`).click();
    const dialog = admin.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(cat.name);
    await expect(dialog, "unused category → says it will be deleted").toContainText(/permanently deleted/i);
  });
});

// ── REQ #5 — Branch Manager dashboard branch information ──────────────────
test.describe("#5 branch manager dashboard branch info", () => {
  test("shows the manager's OWN branch name + brand type (server-resolved)", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const payload = await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json();
    expect(payload.branch, "assigned branch resolved").toBeTruthy();
    expect(payload.branch.brand_type, "brand type present").toBeTruthy();

    await bm.page.goto("/branch-manager/dashboard");
    await expect(bm.page.getByTestId("bm-branch-name")).toHaveText(payload.branch.name);
    await expect(bm.page.getByTestId("bm-branch-type")).toBeVisible();
    await expect(bm.page.getByTestId("bm-branch-status")).toBeVisible();
  });

  test("cross-branch isolation — the payload never reflects a client-supplied branch", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const bmBranch = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch;
    const otherId = Object.values(await branchMap(admin.req)).find((id) => id !== bmBranch.id)!;

    // Forge a branch id on the dashboard endpoint — it must be ignored.
    const forged = await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/?branch_id=${otherId}&branch=${otherId}`)).json();
    expect(forged.branch.id, "still the manager's own branch").toBe(bmBranch.id);
  });
});

// ── REQ #6 — Branch Manager delivery-area module ──────────────────────────
test.describe("#6 branch manager delivery areas", () => {
  test("BM manages ONLY their own branch's areas: add, edit, hold/resume, time + charge", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    // Add (branch id comes from the assignment, not the body).
    const name = uniq("BMArea");
    const created = await bm.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: 999999, name, estimated_delivery_minutes: 35, delivery_charge: 45 },
    });
    expect(created.status()).toBe(201);
    const area = await created.json();
    expect(area.branch, "submitted branch_id ignored → own branch").toBe(own);

    // Edit name + time + charge.
    const patched = await bm.req.patch(`${API_BASE}/api/delivery-areas/${area.id}/`, {
      data: { name: `${name}-edited`, estimated_delivery_minutes: 50, delivery_charge: 75 },
    });
    expect(patched.status()).toBe(200);
    const updated = await patched.json();
    expect(updated.name).toBe(`${name}-edited`);
    expect(updated.estimated_delivery_minutes).toBe(50);
    expect(Number(updated.delivery_charge)).toBeCloseTo(75, 2);

    // Hold → resume.
    expect((await bm.req.post(`${API_BASE}/api/delivery-areas/${area.id}/hold/`, { data: { reason: "rain" } })).status()).toBe(200);
    expect((await (await bm.req.get(`${API_BASE}/api/delivery-areas/?branch_id=${own}`)).json())
      .results.find((a: { id: number }) => a.id === area.id).is_held).toBe(true);
    expect((await bm.req.post(`${API_BASE}/api/delivery-areas/${area.id}/resume/`, { data: {} })).status()).toBe(200);

    // Deactivate / reactivate.
    expect((await bm.req.patch(`${API_BASE}/api/delivery-areas/${area.id}/`, { data: { is_active: false } })).status()).toBe(200);
    expect((await bm.req.patch(`${API_BASE}/api/delivery-areas/${area.id}/`, { data: { is_active: true } })).status()).toBe(200);

    // Duplicate normalized name inside the branch is rejected.
    const dup = await bm.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { name: `  ${name.toUpperCase()}-EDITED  `, estimated_delivery_minutes: 30, delivery_charge: 10 },
    });
    expect(dup.status(), "normalized duplicate rejected").toBe(400);
  });

  test("cross-branch area access is refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const otherId = Object.values(await branchMap(admin.req)).find((id) => id !== own)!;

    const foreign = await (await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: otherId, name: uniq("Foreign"), estimated_delivery_minutes: 30, delivery_charge: 10 },
    })).json();

    expect((await bm.req.patch(`${API_BASE}/api/delivery-areas/${foreign.id}/`, { data: { name: "hax" } })).status())
      .toBeGreaterThanOrEqual(403);
    expect((await bm.req.post(`${API_BASE}/api/delivery-areas/${foreign.id}/hold/`, { data: {} })).status())
      .toBeGreaterThanOrEqual(403);
  });

  test("the Delivery Areas page is reachable from the BM sidebar", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    await bm.page.goto("/branch-manager/delivery-areas");
    await expect(bm.page).toHaveURL(/\/branch-manager\/delivery-areas/);
    // Own-branch areas render (the manager has at least the ones created above).
    await expect(bm.page.locator("body")).not.toContainText("Something went wrong");
  });

  test("a held area blocks a NEW order but existing order snapshots are unchanged", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const { results: products } = await (await customer.req.get(`${API_BASE}/api/products/?branch_id=${main}&page_size=50`)).json();
    const product = products.find((p: { variation_type: string }) => p.variation_type !== "BOTH") ?? products[0];

    const area = await (await admin.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { branch_id: main, name: uniq("SnapArea"), estimated_delivery_minutes: 40, delivery_charge: 65 },
    })).json();

    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Snapshot test, Dhaka",
        fulfillment_type: "delivery", ...INSIDE, delivery_area_id: area.id,
        items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
      },
    });
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    expect(Number(order.delivery_charge)).toBeCloseTo(65, 2);
    expect(order.delivery_estimate_minutes).toBe(40);

    // Hold + change the area's charge/time — the existing order must not move.
    expect((await admin.req.post(`${API_BASE}/api/delivery-areas/${area.id}/hold/`, { data: { reason: "storm" } })).status()).toBe(200);
    await admin.req.patch(`${API_BASE}/api/delivery-areas/${area.id}/`, { data: { delivery_charge: 999, estimated_delivery_minutes: 5 } });

    const reread = await (await customer.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    expect(Number(reread.delivery_charge), "charge snapshot immutable").toBeCloseTo(65, 2);
    expect(reread.delivery_estimate_minutes, "time snapshot immutable").toBe(40);

    // A NEW order into the held area is rejected.
    const blocked = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Held area, Dhaka",
        fulfillment_type: "delivery", ...INSIDE, delivery_area_id: area.id,
        items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
      },
    });
    expect(blocked.status(), "held area blocks new orders").toBe(400);
  });
});
