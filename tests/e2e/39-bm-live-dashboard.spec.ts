import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE I/D — the Branch Manager live dashboard and its targeted polling.
 *
 * The two things worth proving:
 * 1. every number is a REAL count for the manager's own branch — placing an
 *    order moves exactly the tile it should, and nothing else;
 * 2. the board updates WITHOUT a page reload — the test pins a value into the
 *    page and asserts it survives the update, which a full reload would wipe.
 */

const LIVE = `${API_BASE}/api/dashboard/branch-manager/live/`;
const INSIDE = { lat: 23.781, lng: 90.408 };

async function newOrder(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=50`)).json();
  const list = results as { id: number; variation_type: string }[];
  const product = list.find((p) => p.variation_type !== "BOTH") ?? list[0];
  const res = await req.post(`${API_BASE}/api/orders/`, {
    data: {
      branch_id: branchId, payment_method: "cash", delivery_address: "Live board test, Dhaka",
      fulfillment_type: "delivery", ...INSIDE,
      items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
    },
  });
  expect(res.status(), "order created").toBe(201);
  return res.json();
}

test.describe("Phase I — real branch-scoped counts", () => {
  test("the snapshot reports every tracked status and counts a new order", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    const branchId = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    const before = await (await bm.req.get(LIVE)).json();
    expect(before.branch.id, "the manager's own branch").toBe(branchId);
    // Every tracked status is present, even at zero — an absent key would let a
    // quiet status silently disappear from the board.
    for (const status of ["pending", "accepted", "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled"]) {
      expect(typeof before.orders[status], `${status} reported`).toBe("number");
    }
    for (const key of ["present", "absent", "late", "leave", "half_day"]) {
      expect(typeof before.attendance[key], `attendance ${key}`).toBe("number");
    }

    await newOrder(customer.req, branchId);

    const after = await (await bm.req.get(LIVE)).json();
    expect(after.orders.pending, "a new order lands in pending").toBe(before.orders.pending + 1);
    expect(after.orders_total).toBe(before.orders_total + 1);
    expect(after.orders.delivered, "unrelated tiles do not move").toBe(before.orders.delivered);
  });

  test("moving an order through the workflow moves the tiles with it", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    const branchId = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    const order = await newOrder(customer.req, branchId);
    const before = await (await bm.req.get(LIVE)).json();

    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status/`, { data: { status: "accepted" } })).status()).toBe(200);

    const after = await (await bm.req.get(LIVE)).json();
    expect(after.orders.pending, "left pending").toBe(before.orders.pending - 1);
    expect(after.orders.accepted, "arrived in accepted").toBe(before.orders.accepted + 1);
    expect(after.orders_total, "the day's total is unchanged by a transition").toBe(before.orders_total);
  });

  test("a forged branch id cannot widen the snapshot, and other roles are refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const { results } = await (await admin.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    const other = (results as { id: number }[]).find((b) => b.id !== own)!;

    // The endpoint takes no branch parameter; supplying one changes nothing.
    const forged = await (await bm.req.get(`${LIVE}?branch_id=${other.id}`)).json();
    expect(forged.branch.id, "still the manager's own branch").toBe(own);

    for (const role of ["management", "accounts", "marketing", "rider", "customer"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.get(LIVE)).status(), `${role} refused`).toBe(403);
      await s.context.close();
    }
  });

  test("pending bKash verifications and held delivery areas are surfaced", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const snapshot = await (await bm.req.get(LIVE)).json();
    expect(typeof snapshot.payments.pending_verification).toBe("number");
    expect(typeof snapshot.delivery_areas.held).toBe("number");
    expect(typeof snapshot.delivery_areas.inactive).toBe("number");
    expect(typeof snapshot.riders.online).toBe("number");
    expect(typeof snapshot.staff.active).toBe("number");
    expect(typeof snapshot.notifications.unread).toBe("number");

    // Holding an area is reflected in the very next snapshot. The area is
    // created here so the test does not depend on what the seed happens to
    // contain (the branch id comes from the assignment, not the body).
    const created = await bm.req.post(`${API_BASE}/api/delivery-areas/`, {
      data: { name: `LiveArea-${Date.now()}`, estimated_delivery_minutes: 30, delivery_charge: 40 },
    });
    expect(created.status(), "delivery area created").toBe(201);
    const area = await created.json();

    const withArea = await (await bm.req.get(LIVE)).json();
    expect(withArea.delivery_areas.total, "the new area is counted").toBe(snapshot.delivery_areas.total + 1);

    expect((await bm.req.post(`${API_BASE}/api/delivery-areas/${area.id}/hold/`, { data: { reason: "rain" } })).status()).toBe(200);
    const held = await (await bm.req.get(LIVE)).json();
    expect(held.delivery_areas.held, "the hold is visible on the board").toBe(withArea.delivery_areas.held + 1);

    expect((await bm.req.post(`${API_BASE}/api/delivery-areas/${area.id}/resume/`, { data: {} })).status()).toBe(200);
    const resumed = await (await bm.req.get(LIVE)).json();
    expect(resumed.delivery_areas.held, "resuming clears it again").toBe(withArea.delivery_areas.held);
  });
});

test.describe("Phase D — the board refreshes without reloading the page", () => {
  test("counts update in place while page state survives", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    const branchId = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    await bm.page.goto("/branch-manager/dashboard");
    // The board renders after its first poll returns; wait for the board itself
    // before reading a tile, so a slow first response is not read as a missing
    // element.
    await expect(bm.page.getByTestId("live-board")).toBeVisible({ timeout: 20_000 });
    const tile = bm.page.getByTestId("live-orders-pending-value");
    await expect(tile).toBeVisible();
    const before = Number(await tile.textContent());

    // A marker that only survives if the document is never reloaded.
    await bm.page.evaluate(() => {
      (window as unknown as { __liveProbe?: string }).__liveProbe = "kept";
    });

    await newOrder(customer.req, branchId);

    // The polling interval is 2s; the assertion waits for the value to move.
    await expect(tile).toHaveText(String(before + 1), { timeout: 15_000 });

    const probe = await bm.page.evaluate(() => (window as unknown as { __liveProbe?: string }).__liveProbe);
    expect(probe, "the page was updated in place, not reloaded").toBe("kept");
  });
});
