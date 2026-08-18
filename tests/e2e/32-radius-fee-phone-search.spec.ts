import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE 10 — Super Admin customer search by phone number (normalized).
 * PHASE 11 — branch delivery radius + fee configuration and enforcement.
 * PHASE 15 — Branch Manager branch identity shows radius + fee.
 */

const INSIDE = { lat: 23.781, lng: 90.408 };

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

// ── PHASE 10 ──────────────────────────────────────────────────────────────
test.describe("Phase 10 — customer search by phone", () => {
  test("finds the same customer from every common Bangladesh phone format", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // The seeded customer's stored number is the local 01... form.
    const { results: seed } = await (await admin.req.get(
      `${API_BASE}/api/auth/users/?role=customer&search=customer&page_size=20`,
    )).json();
    const target = (seed as { id: number; phone: string; username: string }[])
      .find((u) => u.username === "customer");
    expect(target, "seeded customer exists").toBeTruthy();
    const local = target!.phone; // e.g. 01711111111
    const significant = local.replace(/^0/, ""); // 1711111111

    const variants = [
      local,                       // 01711111111
      `+880${significant}`,        // +8801711111111
      `880${significant}`,         // 8801711111111
      `+880 ${significant.slice(0, 4)}-${significant.slice(4)}`, // spaced + dashed
      local.slice(0, 6),           // partial 017111
    ];

    for (const q of variants) {
      const res = await admin.req.get(`${API_BASE}/api/auth/users/?role=customer&search=${encodeURIComponent(q)}`);
      expect(res.status(), `query ${q}`).toBe(200);
      const { results } = await res.json();
      expect(
        (results as { id: number }[]).some((u) => u.id === target!.id),
        `"${q}" finds the customer`,
      ).toBe(true);
    }
  });

  test("a non-matching number returns an empty result (no accidental match-all)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const res = await admin.req.get(`${API_BASE}/api/auth/users/?role=customer&search=01999888777`);
    expect(res.status()).toBe(200);
    expect((await res.json()).results.length, "no fabricated matches").toBe(0);
  });

  test("results are paginated, not the whole table", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const res = await admin.req.get(`${API_BASE}/api/auth/users/?role=customer&page_size=1`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length, "page_size honoured").toBeLessThanOrEqual(1);
    expect(body, "count returned for pagination").toHaveProperty("count");
  });

  test("non-super-admin roles cannot search the user directory", async ({ browser }) => {
    for (const role of ["customer", "rider", "branch_manager"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.get(`${API_BASE}/api/auth/users/?search=01711111111`);
      expect(res.status(), `${role} refused`).toBeGreaterThanOrEqual(403);
      await s.context.close();
    }
  });
});

// ── PHASE 11 / 15 ─────────────────────────────────────────────────────────
test.describe("Phase 11 — delivery radius + fee", () => {
  test("super admin configures any branch; values persist", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const res = await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
      data: { delivery_radius_km: 7.5, delivery_fee: 45 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Number(body.delivery_radius_km)).toBeCloseTo(7.5, 1);
    expect(Number(body.delivery_fee)).toBeCloseTo(45, 2);
  });

  test("branch manager configures ONLY their own branch", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const otherId = Object.values(await branchMap(admin.req)).find((id) => id !== own)!;

    const ok = await bm.req.patch(`${API_BASE}/api/branches/${own}/delivery-settings/`, {
      data: { delivery_radius_km: 6, delivery_fee: 30 },
    });
    expect(ok.status(), "own branch allowed").toBe(200);

    const cross = await bm.req.patch(`${API_BASE}/api/branches/${otherId}/delivery-settings/`, {
      data: { delivery_radius_km: 40 },
    });
    expect(cross.status(), "cross-branch refused").toBe(403);
  });

  test("other roles are refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    for (const role of ["customer", "rider", "accounts", "marketing"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
        data: { delivery_fee: 1 },
      });
      expect(res.status(), `${role} refused`).toBe(403);
      await s.context.close();
    }
  });

  test("invalid radius and fee values are rejected", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const bad = [
      { delivery_radius_km: 0 },        // must be > 0
      { delivery_radius_km: -5 },       // negative
      { delivery_radius_km: "abc" },    // NaN
      { delivery_radius_km: 100000 },   // beyond business max
      { delivery_fee: -1 },             // negative
      { delivery_fee: "x" },            // NaN
      { delivery_fee: 1.005 },          // over-precise
    ];
    for (const data of bad) {
      const res = await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, { data });
      expect(res.status(), `rejects ${JSON.stringify(data)}`).toBe(400);
    }
  });

  test("the branch fee is applied server-side and snapshotted immutably", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];

    // Configure a known radius + fee, then order WITHOUT a named delivery area
    // so the branch-level fee is the one that applies.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
      data: { delivery_radius_km: 9, delivery_fee: 55 },
    });

    const { results: products } = await (await customer.req.get(
      `${API_BASE}/api/products/?branch_id=${main}&page_size=50`,
    )).json();
    const product = (products as { id: number; variation_type: string }[])
      .find((p) => p.variation_type !== "BOTH") ?? products[0];

    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Radius fee test, Dhaka",
        fulfillment_type: "delivery", ...INSIDE,
        items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
      },
    });
    expect(placed.status(), "inside radius → accepted").toBe(201);
    const order = await placed.json();
    expect(Number(order.delivery_charge), "branch fee applied").toBeCloseTo(55, 2);
    expect(order.delivery_radius_km_snapshot, "radius rule snapshotted").not.toBeNull();
    expect(order.delivery_distance_km, "server-computed distance snapshotted").not.toBeNull();

    // Change the fee/radius afterwards — the existing order must not move.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
      data: { delivery_radius_km: 12, delivery_fee: 999 },
    });
    const reread = await (await customer.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    expect(Number(reread.delivery_charge), "charge snapshot immutable").toBeCloseTo(55, 2);
    expect(Number(reread.delivery_radius_km_snapshot), "radius snapshot immutable")
      .toBeCloseTo(Number(order.delivery_radius_km_snapshot), 2);
  });

  test("an order outside the configured radius is rejected", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const { results: products } = await (await customer.req.get(
      `${API_BASE}/api/products/?branch_id=${main}&page_size=50`,
    )).json();
    const product = (products as { id: number; variation_type: string }[])
      .find((p) => p.variation_type !== "BOTH") ?? products[0];

    // Shrink the radius so the previously-inside point is now outside, and
    // remove zone coverage influence by using a far point.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
      data: { delivery_radius_km: 1 },
    });
    const far = { lat: 23.95, lng: 90.62 };
    const res = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Far away, Dhaka",
        fulfillment_type: "delivery", ...far,
        items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
      },
    });
    expect(res.status(), "outside radius → rejected").toBe(400);
    // Restore a sane radius for other specs.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/delivery-settings/`, {
      data: { delivery_radius_km: 5 },
    });
  });
});

test.describe("Phase 15 — branch identity shows radius + fee", () => {
  test("the BM dashboard renders brand, outlet, status, radius and fee", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    await bm.page.goto("/branch-manager/dashboard");
    for (const id of ["bm-branch-name", "bm-branch-type", "bm-branch-status", "bm-branch-radius", "bm-branch-fee"]) {
      await expect(bm.page.getByTestId(id), `${id} visible`).toBeVisible();
    }
    // Radius/fee must reflect the manager's OWN branch payload.
    const payload = await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json();
    expect(payload.branch.delivery_radius_km).toBeDefined();
    expect(payload.branch.delivery_fee).toBeDefined();
  });
});
