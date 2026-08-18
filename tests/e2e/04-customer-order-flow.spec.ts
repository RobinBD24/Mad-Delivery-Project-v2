import { test, expect } from "@playwright/test";
import { newSession, API_BASE } from "./helpers";

test("customer order → BM pipeline → rider deliver → commission once → review", async ({ browser }) => {
  const customer = await newSession(browser, "customer");
  const bm = await newSession(browser, "branch_manager");
  const rider = await newSession(browser, "rider");

  try {
    const prod = (await (await customer.req.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    expect(prod, "a sellable product exists").toBeTruthy();
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    const before = await (await rider.req.get(`${API_BASE}/api/rider/wallet`)).json();

    // 1. customer places an order
    const placed = await customer.req.post(`${API_BASE}/api/orders`, {
      data: {
        branch_id: prod.branch,
        payment_method: "cash",
        delivery_address: "E2E order flow, Dhaka", lat: 23.781, lng: 90.408,
        items: [{ product_id: prod.id, quantity: 2 }],
      },
    });
    expect(placed.status(), "order created").toBe(201);
    const order = await placed.json();
    expect(order.status).toBe("pending");

    // visible in customer UI (English locale → Latin id) with a real row
    await customer.page.goto("/customer/orders");
    await expect(customer.page.locator("table tbody tr").first()).toBeVisible();
    await expect(customer.page.locator("body")).toContainText(String(order.id));

    // 2. BM pipeline
    for (const status of ["accepted", "preparing", "ready"]) {
      const r = await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status } });
      expect(r.status(), `BM ${status}`).toBe(200);
    }
    // 3. assign rider (rider is on active duty at this branch via seed)
    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(200);
    // 3b. rider confirms physically receiving the order before delivery (C5)
    expect((await rider.req.post(`${API_BASE}/api/rider/orders/${order.id}/confirm-receive`)).status()).toBe(200);
    // 4. rider delivers
    for (const status of ["picked_up", "on_the_way", "delivered"]) {
      const r = await rider.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status } });
      expect(r.status(), `rider ${status}`).toBe(200);
    }

    // 5. commission recorded exactly once — a replayed "delivered" is rejected
    expect((await rider.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: "delivered" } })).status(), "no double commission (invalid transition → 409)").toBe(409);

    // 6. wallet earnings increased by exactly one delivery
    const after = await (await rider.req.get(`${API_BASE}/api/rider/wallet`)).json();
    expect(after.total_deliveries).toBe(before.total_deliveries + 1);
    expect(Number(after.total_earnings)).toBeGreaterThan(Number(before.total_earnings));

    // 7. customer reviews the delivered order (fresh order → first review → 201)
    const review = await customer.req.post(`${API_BASE}/api/reviews`, {
      data: { order_id: order.id, type: "rider", rating: 5, comment: "e2e" },
    });
    expect(review.status(), "rider review accepted").toBe(201);
    // reviewing again for the same order is rejected
    expect((await customer.req.post(`${API_BASE}/api/reviews`, {
      data: { order_id: order.id, type: "rider", rating: 4 },
    })).status(), "duplicate review rejected").toBe(400);
  } finally {
    await customer.context.close();
    await bm.context.close();
    await rider.context.close();
  }
});
