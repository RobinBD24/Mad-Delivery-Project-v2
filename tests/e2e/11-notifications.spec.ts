import { test, expect } from "@playwright/test";
import { newSession, API_BASE } from "./helpers";

// Role → its notifications inbox route.
const NOTIF_PAGE: Record<string, string> = {
  super_admin: "/admin/notifications",
  management: "/management/notifications",
  marketing: "/marketing/notifications",
  branch_manager: "/branch-manager/notifications",
  accounts: "/accounts/notifications",
  rider: "/rider/notifications",
  customer: "/customer/notifications",
};

const unread = async (req: { get: (u: string) => Promise<{ json: () => Promise<{ count: number }> }> }) =>
  (await (await req.get(`${API_BASE}/api/notifications/unread-count`)).json()).count;

// 1–2: every role has a working, populated notifications page. Uses total item
// count (persists regardless of other tests marking things read) so the check
// is order-independent.
for (const [role, path] of Object.entries(NOTIF_PAGE)) {
  test(`${role}: notifications page loads with seeded items`, async ({ browser }) => {
    const s = await newSession(browser, role);
    try {
      const list = await (await s.req.get(`${API_BASE}/api/notifications?page_size=100`)).json();
      expect(list.count, `${role} has seeded notifications`).toBeGreaterThan(0);
      await s.page.goto(path);
      await expect(s.page.getByRole("heading", { name: /notifications|নোটিফিকেশন/i })).toBeVisible();
      await expect(s.page.locator("ul li").first(), `${role} has ≥1 notification`).toBeVisible();
    } finally {
      await s.context.close();
    }
  });
}

// A freshly-seeded, order-independent role still shows a live unread badge count.
test("a seeded role reports a positive unread count (badge source)", async ({ browser }) => {
  const s = await newSession(browser, "management"); // untouched by other specs
  try {
    expect(await unread(s.req)).toBeGreaterThan(0);
  } finally {
    await s.context.close();
  }
});

// 3–4: a system notification renders translated in EN and BN (no raw keys).
// Self-generates a FRESH notification (rider assigned → customer) instead of
// relying on a seeded row, which older runs push off the first page.
test("system notification content translates in English and Bangla", async ({ browser }) => {
  const bm = await newSession(browser, "branch_manager");
  // Assignment now requires the rider to be online (offline riders must not
  // receive orders) — clock the seeded rider in first.
  const riderSession = await newSession(browser, "rider");
  await riderSession.req.post(`${API_BASE}/api/riders/online`, { data: { online: true } });
  await riderSession.context.close();
  let orderId: number;
  try {
    const riders = await (await bm.page.request.get(`${API_BASE}/api/riders/branch`)).json();
    const orders = await (await bm.page.request.get(`${API_BASE}/api/orders/?page_size=1`)).json();
    orderId = orders.results[0].id;
    const res = await bm.page.request.post(`${API_BASE}/api/orders/${orderId}/assign-rider`, {
      data: { rider_id: riders[0].user },
    });
    expect(res.ok()).toBeTruthy();
  } finally {
    await bm.context.close();
  }

  const en = await newSession(browser, "customer", "en");
  const bn = await newSession(browser, "customer", "bn");
  try {
    await en.page.goto("/customer/notifications");
    await expect(en.page.getByText(/rider assigned/i).first()).toBeVisible();
    await expect(en.page.getByText(/notifications\.[a-z]/i)).toHaveCount(0); // no raw keys

    await bn.page.goto("/customer/notifications");
    await expect(bn.page.getByText(/রাইডার নিয়োগ হয়েছে/).first()).toBeVisible();
    await expect(bn.page.getByText(/rider assigned/i)).toHaveCount(0); // no English leak in BN
  } finally {
    await en.context.close();
    await bn.context.close();
  }
});

// 5: marking one notification read drops the unread count by one.
test("mark one read decreases the unread count by exactly one", async ({ browser }) => {
  const s = await newSession(browser, "customer");
  try {
    const before = await unread(s.req);
    const list = await (await s.req.get(`${API_BASE}/api/notifications?unread=1`)).json();
    const id = list.results[0].id as number;
    expect((await s.req.post(`${API_BASE}/api/notifications/${id}/read`)).status()).toBe(200);
    await expect.poll(() => unread(s.req)).toBe(before - 1);
  } finally {
    await s.context.close();
  }
});

// 6: mark all read zeroes the badge. Self-generates a fresh unread (placing an
// order pings the customer) so the test never depends on leftover seed state.
test("mark all read sets the unread count to zero", async ({ browser }) => {
  const s = await newSession(browser, "customer");
  try {
    const prod = (await (await s.req.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    await s.req.post(`${API_BASE}/api/orders`, {
      data: { branch_id: prod.branch, payment_method: "cash", delivery_address: "markall", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
    });
    await expect.poll(() => unread(s.req)).toBeGreaterThan(0);
    expect((await s.req.post(`${API_BASE}/api/notifications/read-all`)).status()).toBe(200);
    await expect.poll(() => unread(s.req)).toBe(0);
  } finally {
    await s.context.close();
  }
});

// 7: a user cannot read or delete another user's notification (server-scoped).
test("cross-user isolation: cannot read or delete someone else's notification", async ({ browser }) => {
  const victim = await newSession(browser, "management");
  const attacker = await newSession(browser, "marketing");
  try {
    const before = await unread(victim.req);
    const list = await (await victim.req.get(`${API_BASE}/api/notifications?unread=1`)).json();
    const victimId = list.results[0].id as number;

    // attacker "reads" the victim's id — scoped updateMany matches nothing.
    await attacker.req.post(`${API_BASE}/api/notifications/${victimId}/read`);
    await attacker.req.delete(`${API_BASE}/api/notifications/${victimId}`);

    // victim's notification is untouched.
    expect(await unread(victim.req)).toBe(before);
    const still = await (await victim.req.get(`${API_BASE}/api/notifications?unread=1`)).json();
    expect(still.results.some((n: { id: number }) => n.id === victimId)).toBe(true);
  } finally {
    await victim.context.close();
    await attacker.context.close();
  }
});

// 8–9: a role-specific notification is visible to that role and absent for others.
test("role isolation: management's 'New order' is not in the customer's inbox", async ({ browser }) => {
  const management = await newSession(browser, "management", "en");
  const customer = await newSession(browser, "customer", "en");
  try {
    await management.page.goto("/management/notifications");
    await expect(management.page.getByText("New order").first()).toBeVisible();

    await customer.page.goto("/customer/notifications");
    await expect(customer.page.getByText("New order")).toHaveCount(0);
  } finally {
    await management.context.close();
    await customer.context.close();
  }
});

// 10 + 11: placing an order + assigning a rider create the right notifications.
test("order lifecycle creates customer + rider + branch-manager notifications", async ({ browser }) => {
  const customer = await newSession(browser, "customer");
  const bm = await newSession(browser, "branch_manager");
  const rider = await newSession(browser, "rider");
  try {
    const beforeCustomer = await unread(customer.req);
    const beforeBm = await unread(bm.req);
    const beforeRider = await unread(rider.req);

    const prod = (await (await customer.req.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    // Offline riders can't be assigned — go online before the assignment step.
    expect((await rider.req.post(`${API_BASE}/api/riders/online`, { data: { online: true } })).ok()).toBeTruthy();
    const order = await (await customer.req.post(`${API_BASE}/api/orders`, {
      data: { branch_id: prod.branch, payment_method: "cash", delivery_address: "notif-test", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
    })).json();

    // order placed → customer confirmation + branch manager alert
    await expect.poll(() => unread(customer.req)).toBeGreaterThan(beforeCustomer);
    await expect.poll(() => unread(bm.req)).toBeGreaterThan(beforeBm);

    // rider assigned → rider notification
    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(200);
    await expect.poll(() => unread(rider.req)).toBeGreaterThan(beforeRider);

    // status change → customer gets another update
    const afterAssign = await unread(customer.req);
    expect((await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: "accepted" } })).status()).toBe(200);
    await expect.poll(() => unread(customer.req)).toBeGreaterThan(afterAssign);

    // Cleanup: cancel so the rider has no dangling active delivery (blocks offline).
    await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: "cancelled", reason: "Cancelled by branch manager for test" } });
  } finally {
    await customer.context.close();
    await bm.context.close();
    await rider.context.close();
  }
});

// 12: a withdrawal request notifies accounts; the decision notifies the rider.
test("withdrawal request notifies accounts and the decision notifies the rider", async ({ browser }) => {
  const rider = await newSession(browser, "rider");
  const accounts = await newSession(browser, "accounts");
  try {
    const beforeAccounts = await unread(accounts.req);
    // Rider has a seeded available balance; a small request always succeeds.
    const req = await rider.req.post(`${API_BASE}/api/rider/withdrawals`, { data: { amount: "5", note: "e2e" } });
    expect(req.status(), "withdrawal created").toBe(201);
    await expect.poll(() => unread(accounts.req)).toBeGreaterThan(beforeAccounts);

    const wd = await req.json();
    const beforeRider = await unread(rider.req);
    const decided = await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd.id}/decide`, {
      data: { decision: "reject", reason: "e2e test" },
    });
    expect(decided.status()).toBe(200);
    await expect.poll(() => unread(rider.req)).toBeGreaterThan(beforeRider);
  } finally {
    await rider.context.close();
    await accounts.context.close();
  }
});

// 13: a complaint reply notifies the other party.
test("complaint reply creates a notification for the recipient", async ({ browser }) => {
  const customer = await newSession(browser, "customer");
  const admin = await newSession(browser, "super_admin");
  try {
    const filed = await customer.req.post(`${API_BASE}/api/complaints`, {
      data: { recipient_role: "super_admin", category: "service", subject: "notif complaint", message: "body" },
    });
    expect(filed.status()).toBe(201);
    const complaint = await filed.json();

    const beforeCustomer = await unread(customer.req);
    // super admin (recipient/handler) replies → complainant is notified
    expect((await admin.req.post(`${API_BASE}/api/complaints/${complaint.id}/messages`, { data: { body: "handler reply" } })).status()).toBe(201);
    await expect.poll(() => unread(customer.req)).toBeGreaterThan(beforeCustomer);
  } finally {
    await customer.context.close();
    await admin.context.close();
  }
});

// 14: disabling the customer toggle suppresses OPTIONAL (marketing) notifications
// but NEVER transactional ones (order updates still arrive).
test("preferences: toggle off blocks marketing but transactional notifications still arrive", async ({ browser }) => {
  const customer = await newSession(browser, "customer");
  const marketing = await newSession(browser, "marketing");
  try {
    // customer disables notifications
    expect((await customer.req.patch(`${API_BASE}/api/customer/settings`, { data: { notifications_enabled: false } })).status()).toBe(200);

    // a marketing broadcast to all customers must NOT reach this customer
    const beforeMktg = await unread(customer.req);
    await marketing.req.post(`${API_BASE}/api/notices`, {
      data: { title: "Promo blast", body: "Big sale", audience: "customer", type: "marketing" },
    });
    await expect.poll(() => unread(customer.req), { timeout: 6_000 }).toBe(beforeMktg); // unchanged

    // but a transactional order update MUST still arrive
    const prod = (await (await customer.req.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    const beforeTxn = await unread(customer.req);
    await customer.req.post(`${API_BASE}/api/orders`, {
      data: { branch_id: prod.branch, payment_method: "cash", delivery_address: "txn", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
    });
    await expect.poll(() => unread(customer.req)).toBeGreaterThan(beforeTxn);
  } finally {
    // restore the toggle so the suite stays idempotent
    await customer.req.patch(`${API_BASE}/api/customer/settings`, { data: { notifications_enabled: true } });
    await customer.context.close();
    await marketing.context.close();
  }
});
