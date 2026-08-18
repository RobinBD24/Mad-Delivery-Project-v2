import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE H — super-admin EARNING RULES.
 *
 * What these tests actually prove, beyond "the endpoint returns 200":
 * - the point maths is decimal-safe (a 0.1/৳ rate on a real order total),
 * - a rule only pays when the order genuinely qualifies (minimum amount),
 * - editing a rule cannot retroactively rewrite a ledger entry,
 * - a rule that has paid out is archived rather than deleted,
 * - two active rules that could both claim the same order are refused (409).
 */

const INSIDE = { lat: 23.781, lng: 90.408 };
const RULES = `${API_BASE}/api/admin/reward-rules/`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

/** The reward programme must be ON for an award to happen (Phase G gate). */
async function ensureProgrammeActive(req: APIRequestContext) {
  const res = await req.post(`${API_BASE}/api/admin/rewards/status/`, { data: { is_active: true } });
  // 409 = already active, which is exactly the state we want.
  expect([200, 409]).toContain(res.status());
}

async function newOrder(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=50`)).json();
  const list = results as { id: number; variation_type: string }[];
  const product = list.find((p) => p.variation_type !== "BOTH") ?? list[0];
  const res = await req.post(`${API_BASE}/api/orders/`, {
    data: {
      branch_id: branchId, payment_method: "cash", delivery_address: "Earning rule test, Dhaka",
      fulfillment_type: "delivery", ...INSIDE,
      items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
    },
  });
  expect(res.status(), "order created").toBe(201);
  return res.json() as Promise<{ id: number; total_amount: string }>;
}

const setStatus = (req: APIRequestContext, id: number, status: string) =>
  req.post(`${API_BASE}/api/orders/${id}/update-status/`, { data: { status } });

/** Drive an order all the way to delivered, which is what triggers the award. */
async function deliver(
  bm: APIRequestContext,
  rider: APIRequestContext,
  riderId: number,
  orderId: number,
) {
  for (const s of ["accepted", "preparing", "ready"]) {
    expect((await setStatus(bm, orderId, s)).status(), `→ ${s}`).toBe(200);
  }
  expect((await bm.post(`${API_BASE}/api/orders/${orderId}/assign-rider/`, { data: { rider_id: riderId } })).status()).toBe(200);
  expect((await rider.post(`${API_BASE}/api/rider/orders/${orderId}/confirm-receive/`)).status()).toBe(200);
  for (const s of ["picked_up", "on_the_way", "delivered"]) {
    expect((await setStatus(rider, orderId, s)).status(), `→ ${s}`).toBe(200);
  }
}

async function balanceOf(req: APIRequestContext): Promise<number> {
  return (await (await req.get(`${API_BASE}/api/customer/rewards/`)).json()).balance as number;
}

/** Remove a rule created by a test so later tests start from a known scope. */
async function cleanup(req: APIRequestContext, id: number | undefined) {
  if (id) await req.delete(`${RULES}${id}/`);
}

test.describe("Phase H — authorization", () => {
  test("only a super admin can read or write earning rules", async ({ browser }) => {
    for (const role of ["management", "marketing", "branch_manager", "accounts", "rider", "customer"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.get(RULES)).status(), `${role} list`).toBe(403);
      expect(
        (await s.req.post(RULES, { data: { name: "Sneaky", fixed_points: 5 } })).status(),
        `${role} create`,
      ).toBe(403);
      await s.context.close();
    }
  });
});

test.describe("Phase H — validation", () => {
  test("negative values, pointless rules and reversed dates are rejected", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");

    expect((await admin.req.post(RULES, { data: { fixed_points: 10 } })).status(), "name required").toBe(400);
    expect(
      (await admin.req.post(RULES, { data: { name: "Neg", fixed_points: -5 } })).status(),
      "negative points",
    ).toBe(400);
    expect(
      (await admin.req.post(RULES, { data: { name: "NegMin", fixed_points: 5, min_order_amount: -1 } })).status(),
      "negative minimum",
    ).toBe(400);
    expect(
      (await admin.req.post(RULES, { data: { name: "Zero", fixed_points: 0, points_per_currency: 0 } })).status(),
      "a rule must award something",
    ).toBe(400);
    expect(
      (await admin.req.post(RULES, {
        data: { name: "Backwards", fixed_points: 5, starts_at: "2030-02-01T00:00", ends_at: "2030-01-01T00:00" },
      })).status(),
      "end before start",
    ).toBe(400);
    expect(
      (await admin.req.post(RULES, { data: { name: "NoBranch", fixed_points: 5, branch_id: 999999 } })).status(),
      "unknown branch",
    ).toBe(400);
  });

  test("two active rules that could claim the same order are refused (409)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const first = await admin.req.post(RULES, {
      data: { name: `Ambig A ${Date.now()}`, fixed_points: 5, priority: 77 },
    });
    expect(first.status()).toBe(201);
    const firstId = (await first.json()).id as number;

    // Same priority, same (global) scope, same trigger status → ambiguous.
    const clash = await admin.req.post(RULES, {
      data: { name: `Ambig B ${Date.now()}`, fixed_points: 9, priority: 77 },
    });
    expect(clash.status(), "ambiguous overlap refused").toBe(409);

    // An explicit, different priority resolves it.
    const resolved = await admin.req.post(RULES, {
      data: { name: `Ambig C ${Date.now()}`, fixed_points: 9, priority: 78 },
    });
    expect(resolved.status(), "distinct priority is allowed").toBe(201);

    await cleanup(admin.req, firstId);
    await cleanup(admin.req, (await resolved.json()).id);
  });
});

test.describe("Phase H — awarding", () => {
  test("a matching rule prices the delivered order, decimal-safe", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    await ensureProgrammeActive(admin.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;

    const created = await admin.req.post(RULES, {
      data: {
        name: `Award ${Date.now()}`,
        fixed_points: 20,
        points_per_currency: 0.1,
        priority: 900,
        branch_id: main,
      },
    });
    expect(created.status()).toBe(201);
    const ruleId = (await created.json()).id as number;

    const before = await balanceOf(customer.req);
    const order = await newOrder(customer.req, main);
    await deliver(bm.req, rider.req, riderId, order.id);

    // coins = 20 + floor(total × 0.1) — computed in integer space server-side.
    const expected = 20 + Math.floor((Math.round(Number(order.total_amount) * 100) * 100) / 100_000);
    const after = await balanceOf(customer.req);
    expect(after - before, "rule-priced award").toBe(expected);

    await cleanup(admin.req, ruleId);
  });

  test("an order below the minimum falls back to the fixed coin amount", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    await ensureProgrammeActive(admin.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;

    // A minimum no test order will ever reach.
    const created = await admin.req.post(RULES, {
      data: { name: `TooHigh ${Date.now()}`, fixed_points: 500, min_order_amount: 999999, priority: 901, branch_id: main },
    });
    expect(created.status()).toBe(201);
    const ruleId = (await created.json()).id as number;

    const legacy = (await (await customer.req.get(`${API_BASE}/api/customer/rewards/`)).json()).rules.find(
      (r: { key: string }) => r.key === "order_delivered",
    ) as { coins: number; is_active: boolean };

    const before = await balanceOf(customer.req);
    const order = await newOrder(customer.req, main);
    await deliver(bm.req, rider.req, riderId, order.id);
    const after = await balanceOf(customer.req);

    expect(after - before, "the unqualified rule paid nothing; the fixed amount applied").toBe(
      legacy.is_active ? legacy.coins : 0,
    );

    await cleanup(admin.req, ruleId);
  });

  test("editing a rule never rewrites an award it already made", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    await ensureProgrammeActive(admin.req);
    const main = (await branchMap(admin.req))["Main Branch"];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;

    const created = await admin.req.post(RULES, {
      data: { name: `Frozen ${Date.now()}`, fixed_points: 33, priority: 902, branch_id: main },
    });
    const ruleId = (await created.json()).id as number;

    const before = await balanceOf(customer.req);
    const order = await newOrder(customer.req, main);
    await deliver(bm.req, rider.req, riderId, order.id);
    const afterAward = await balanceOf(customer.req);
    expect(afterAward - before, "awarded at the configured rate").toBe(33);

    // Raise the rate — history must not move.
    expect((await admin.req.patch(`${RULES}${ruleId}/`, { data: { fixed_points: 999 } })).status()).toBe(200);
    expect(await balanceOf(customer.req), "past ledger entries are immutable").toBe(afterAward);

    // The rule paid out, so deleting it archives instead.
    const del = await admin.req.delete(`${RULES}${ruleId}/`);
    expect(del.status()).toBe(200);
    const body = await del.json();
    expect(body.archived, "a rule with history is archived").toBe(true);
    expect(body.ledger_entries).toBeGreaterThanOrEqual(1);

    // Archived rules are hidden by default and never award again.
    const plain = await (await admin.req.get(RULES)).json();
    expect(plain.results.some((r: { id: number }) => r.id === ruleId), "hidden from the default list").toBe(false);
    const withArchived = await (await admin.req.get(`${RULES}?include_archived=true`)).json();
    expect(withArchived.results.some((r: { id: number }) => r.id === ruleId), "still listed when asked").toBe(true);
    expect((await admin.req.patch(`${RULES}${ruleId}/`, { data: { fixed_points: 5 } })).status(), "archived is read-only").toBe(409);
  });
});

test.describe("Phase H — lifecycle", () => {
  test("activate/deactivate is idempotent-proof and an unused rule is deleted outright", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const created = await admin.req.post(RULES, {
      data: { name: `Lifecycle ${Date.now()}`, fixed_points: 7, priority: 903 },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id as number;

    expect((await admin.req.patch(`${RULES}${id}/`, { data: { is_active: true } })).status(), "already active").toBe(409);
    expect((await admin.req.patch(`${RULES}${id}/`, { data: { is_active: false } })).status()).toBe(200);
    expect((await (await admin.req.get(`${RULES}${id}/`)).json()).is_active).toBe(false);
    expect((await admin.req.patch(`${RULES}${id}/`, { data: { is_active: false } })).status(), "already paused").toBe(409);
    expect((await admin.req.patch(`${RULES}${id}/`, { data: { is_active: true } })).status()).toBe(200);

    const del = await admin.req.delete(`${RULES}${id}/`);
    expect(del.status()).toBe(200);
    expect((await del.json()).archived, "never awarded → really deleted").toBe(false);
    expect((await admin.req.get(`${RULES}${id}/`)).status(), "gone").toBe(404);
  });

  test("the admin UI lists rules and creates one", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/rewards");
    await expect(admin.page.getByTestId("reward-rules-manager")).toBeVisible();

    const name = `UI rule ${Date.now()}`;
    await admin.page.getByTestId("reward-rule-new").click();
    await expect(admin.page.getByTestId("reward-rule-form")).toBeVisible();
    await admin.page.getByTestId("reward-rule-name").fill(name);
    await admin.page.getByTestId("reward-rule-fixed-points").fill("11");
    await admin.page.getByTestId("reward-rule-priority").fill("904");
    await admin.page.getByTestId("reward-rule-save").click();

    await expect(admin.page.getByText(name)).toBeVisible();

    // Persisted, not just rendered.
    const list = await (await admin.req.get(RULES)).json();
    const saved = list.results.find((r: { name: string }) => r.name === name);
    expect(saved, "rule persisted").toBeTruthy();
    expect(saved.fixed_points).toBe(11);
    await cleanup(admin.req, saved.id);
  });
});
