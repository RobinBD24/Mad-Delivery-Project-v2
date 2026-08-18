import { test, expect } from "@playwright/test";
import { newSession, API_BASE } from "./helpers";

test("complaint: file → recipient reads → reply → status → permission boundaries", async ({ browser }) => {
  const customer = await newSession(browser, "customer");
  const admin = await newSession(browser, "super_admin");
  const marketing = await newSession(browser, "marketing");

  try {
    const filed = await customer.req.post(`${API_BASE}/api/complaints`, {
      data: { recipient_role: "super_admin", category: "service", subject: "E2E complaint subject", message: "e2e body" },
    });
    expect(filed.status(), "complaint created").toBe(201);
    const complaint = await filed.json();

    // super admin (recipient) can read it
    expect((await admin.req.get(`${API_BASE}/api/complaints/${complaint.id}`)).status()).toBe(200);

    // reply works
    expect((await customer.req.post(`${API_BASE}/api/complaints/${complaint.id}/messages`, { data: { body: "e2e reply" } })).status()).toBe(201);

    // super admin sets status
    expect((await admin.req.post(`${API_BASE}/api/complaints/${complaint.id}/status`, { data: { status: "in_progress" } })).status()).toBe(200);

    // complainant cannot change status
    expect((await customer.req.post(`${API_BASE}/api/complaints/${complaint.id}/status`, { data: { status: "resolved" } })).status(), "customer cannot set status").toBe(403);

    // unrelated role cannot read a complaint not addressed to it
    expect((await marketing.req.get(`${API_BASE}/api/complaints/${complaint.id}`)).status(), "wrong-user 403").toBe(403);

    // customer sees it in the UI list
    await customer.page.goto("/customer/complaints");
    await expect(customer.page.getByText("E2E complaint subject").first()).toBeVisible();
  } finally {
    await customer.context.close();
    await admin.context.close();
    await marketing.context.close();
  }
});

test("notifications: unread badge → mark all read clears it", async ({ browser }) => {
  const rider = await newSession(browser, "rider");
  const customer = await newSession(browser, "customer");
  const bm = await newSession(browser, "branch_manager");
  try {
    // Deterministically create a fresh unread rider notification: assigning a
    // rider to an order pings that rider ("new delivery assignment").
    const prod = (await (await customer.req.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    const order = await (await customer.req.post(`${API_BASE}/api/orders`, {
      data: { branch_id: prod.branch, payment_method: "cash", delivery_address: "notif", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
    })).json();
    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(200);
    // Cleanup: release the rider (no dangling active delivery).
    await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: "cancelled", reason: "Cancelled by branch manager for test" } });

    // rider now has ≥1 unread
    await expect
      .poll(async () => (await (await rider.req.get(`${API_BASE}/api/notifications/unread-count`)).json()).count, { timeout: 8_000 })
      .toBeGreaterThan(0);

    await rider.page.goto("/rider/notifications");
    await expect(rider.page.getByRole("heading", { name: /notifications/i })).toBeVisible();
    await expect(rider.page.locator("ul li").first()).toBeVisible();

    const markAll = rider.page.getByRole("button", { name: /mark all read/i });
    await expect(markAll, "mark-all present when unread exist").toBeVisible();
    await markAll.click();

    // unread count really drops to 0
    await expect
      .poll(async () => (await (await rider.req.get(`${API_BASE}/api/notifications/unread-count`)).json()).count, { timeout: 8_000 })
      .toBe(0);
  } finally {
    await rider.context.close();
    await customer.context.close();
    await bm.context.close();
  }
});
