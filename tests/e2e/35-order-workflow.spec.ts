import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE J — the Branch Manager order workflow is a SERVER-ENFORCED state
 * machine. Every valid step is exercised, and every illegal move is refused with
 * 409 (a state conflict, not a field error). Each accepted transition records an
 * append-only audit row with the actor, the from/to statuses and — for a
 * rejection — the reason exactly as typed.
 *
 * The operational flow maps onto the existing statuses:
 *   NEW=pending → accepted → preparing(COOKING) → ready → picked_up
 *   (RECEIVED_BY_RIDER) → on_the_way(OUT_FOR_DELIVERY) → delivered
 */

const INSIDE = { lat: 23.781, lng: 90.408 };

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

async function newOrder(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=50`)).json();
  const list = results as { id: number; variation_type: string }[];
  const product = list.find((p) => p.variation_type !== "BOTH") ?? list[0];
  const res = await req.post(`${API_BASE}/api/orders/`, {
    data: {
      branch_id: branchId, payment_method: "cash", delivery_address: "Workflow test, Dhaka",
      fulfillment_type: "delivery", ...INSIDE,
      items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
    },
  });
  expect(res.status(), "order created").toBe(201);
  return res.json();
}

const setStatus = (req: APIRequestContext, id: number, status: string, reason?: string) =>
  req.post(`${API_BASE}/api/orders/${id}/update-status/`, {
    data: { status, ...(reason !== undefined ? { reason } : {}) },
  });

test.describe("Phase J — valid workflow", () => {
  test("branch manager drives NEW → ACCEPTED → COOKING → READY", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);
    expect(order.status, "starts as NEW/pending").toBe("pending");

    for (const status of ["accepted", "preparing", "ready"]) {
      const res = await setStatus(bm.req, order.id, status);
      expect(res.status(), `→ ${status}`).toBe(200);
      expect((await res.json()).status).toBe(status);
    }
  });

  test("rider completes RECEIVED → OUT_FOR_DELIVERY → DELIVERED after confirming receipt", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;

    for (const s of ["accepted", "preparing", "ready"]) await setStatus(bm.req, order.id, s);
    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/assign-rider/`, { data: { rider_id: riderId } })).status()).toBe(200);

    // The rider must confirm physical receipt before pickup is allowed.
    const early = await setStatus(rider.req, order.id, "picked_up");
    expect(early.status(), "pickup before receive-confirmation is refused").toBe(409);

    expect((await rider.req.post(`${API_BASE}/api/rider/orders/${order.id}/confirm-receive/`)).status()).toBe(200);
    for (const s of ["picked_up", "on_the_way", "delivered"]) {
      const res = await setStatus(rider.req, order.id, s);
      expect(res.status(), `→ ${s}`).toBe(200);
    }
  });
});

test.describe("Phase J — invalid transitions are refused with 409", () => {
  test("skipping steps, moving backwards and re-finalising all conflict", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);

    // pending → ready skips accepted/preparing.
    expect((await setStatus(bm.req, order.id, "ready")).status(), "skip ahead").toBe(409);

    await setStatus(bm.req, order.id, "accepted");
    // accepted → pending is backwards.
    expect((await setStatus(bm.req, order.id, "pending")).status(), "backwards").toBe(409);

    await setStatus(bm.req, order.id, "preparing");
    await setStatus(bm.req, order.id, "ready");
    // ready → preparing is backwards.
    expect((await setStatus(bm.req, order.id, "preparing")).status(), "backwards from ready").toBe(409);
  });

  test("a delivered order is final and cannot move again", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;

    for (const s of ["accepted", "preparing", "ready"]) await setStatus(bm.req, order.id, s);
    await bm.req.post(`${API_BASE}/api/orders/${order.id}/assign-rider/`, { data: { rider_id: riderId } });
    await rider.req.post(`${API_BASE}/api/rider/orders/${order.id}/confirm-receive/`);
    for (const s of ["picked_up", "on_the_way", "delivered"]) await setStatus(rider.req, order.id, s);

    // Re-delivering (a duplicate transition) is a conflict — and must not pay
    // a second commission.
    expect((await setStatus(rider.req, order.id, "delivered")).status(), "delivered is final").toBe(409);
    expect((await setStatus(bm.req, order.id, "cancelled", "too late")).status(), "cannot cancel a delivered order").toBe(409);
  });
});

test.describe("Phase J — rejection reason + audit history", () => {
  test("rejecting requires a reason and stores it exactly as typed", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);

    const noReason = await setStatus(bm.req, order.id, "cancelled");
    expect(noReason.status(), "reason required to reject").toBe(400);

    const reason = "Kitchen closed early — out of stock";
    const rejected = await setStatus(bm.req, order.id, "cancelled", reason);
    expect(rejected.status()).toBe(200);
    expect((await rejected.json()).status).toBe("cancelled");

    // The audit row keeps the reason verbatim.
    const detail = await (await bm.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    const events = detail.status_events ?? [];
    const cancelEvent = (events as { to_status: string; reason: string }[]).find((e) => e.to_status === "cancelled");
    expect(cancelEvent, "cancellation recorded in history").toBeTruthy();
    expect(cancelEvent!.reason, "reason verbatim").toBe(reason);
  });

  test("every accepted transition records actor, from and to", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);

    await setStatus(bm.req, order.id, "accepted");
    await setStatus(bm.req, order.id, "preparing");

    const detail = await (await bm.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    const events = (detail.status_events ?? []) as { from_status: string; to_status: string; actor: number | null }[];
    expect(events.length, "two transitions recorded").toBeGreaterThanOrEqual(2);
    const accepted = events.find((e) => e.to_status === "accepted");
    expect(accepted?.from_status, "from pending").toBe("pending");
    expect(accepted?.actor, "actor recorded").not.toBeNull();
  });
});

test.describe("Phase J — authorization", () => {
  test("a branch manager cannot drive another branch's order", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;

    // A branch that genuinely covers the point but is NOT the manager's.
    const created = await (await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: `WfBranch-${Date.now()}`, address: "Wf Rd", phone: `019${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: "cheez", latitude: String(INSIDE.lat), longitude: String(INSIDE.lng),
      },
    })).json();
    expect(created.id).not.toBe(own);
    await admin.req.post(`${API_BASE}/api/products/`, {
      multipart: {
        branch_id: String(created.id), name: `WfP-${Date.now()}`, variation_type: "THICK",
        variations: JSON.stringify([{ name: "Regular", price: 200, isDefault: true, isEnabled: true }]),
      },
    });
    const order = await newOrder(customer.req, created.id);

    const res = await setStatus(bm.req, order.id, "accepted");
    expect(res.status(), "cross-branch refused").toBe(403);
  });

  test("customers and riders cannot set manager-only statuses", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const order = await newOrder(customer.req, main);

    expect((await setStatus(customer.req, order.id, "accepted")).status(), "customer cannot accept").toBe(403);
    const rider = await apiLogin(browser, "rider");
    expect((await setStatus(rider.req, order.id, "accepted")).status(), "rider cannot accept").toBe(403);
    await rider.context.close();
  });
});
