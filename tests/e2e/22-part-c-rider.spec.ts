import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PART C — rider dynamic branch duty (C1/C2), branch-scoped orders + assignment
 * (C3), duty chat (C4), receive confirmation (C5), delivery chat (C6). Server
 * rules are the source of truth → asserted at the API layer. `rider2` is a
 * dedicated fresh rider so duty-lifecycle tests stay isolated from the seed
 * rider used by other specs.
 */

async function branches(req: APIRequestContext) {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

async function endDutyIfAny(req: APIRequestContext) {
  const duty = await (await req.get(`${API_BASE}/api/rider/duty`)).json();
  if (duty.active_session) await req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
}

/** Create an order at a branch and walk it to "ready" (BM pipeline). */
async function readyOrder(browser: Browser, branchId: number): Promise<number> {
  // API-only sessions (no UI page load) — this helper only calls the API, and
  // avoiding UI logins keeps it off the flaky-under-load login path.
  const cust = await apiLogin(browser, "customer");
  const bm = await apiLogin(browser, "branch_manager");
  const prod = (await (await cust.req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=1`)).json()).results[0];
  const order = await (await cust.req.post(`${API_BASE}/api/orders/`, {
    data: { branch_id: branchId, payment_method: "cash", delivery_address: "Part C, Dhaka", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
  })).json();
  for (const s of ["accepted", "preparing", "ready"]) {
    await bm.req.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: s } });
  }
  await cust.context.close(); await bm.context.close();
  return order.id;
}

test.describe("Part C — rider workflow", () => {
  // ── C1: dynamic branch selection ───────────────────────────────────────
  test("C1: rider cannot go online without selecting a branch", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    await endDutyIfAny(s.req);
    // Raw online toggle without a session is rejected.
    expect((await s.req.post(`${API_BASE}/api/riders/online`, { data: { online: true } })).status()).toBe(400);
    // Duty start without a branch is rejected.
    expect((await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: {} })).status()).toBe(400);
    await s.context.close();
  });

  test("C1: only active branches are eligible; starting duty opens a session", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    await endDutyIfAny(s.req);
    const duty = await (await s.req.get(`${API_BASE}/api/rider/duty`)).json();
    expect(duty.eligible_branches.length).toBeGreaterThan(0);
    const main = (await branches(s.req))["Main Branch"];
    const start = await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main } });
    expect(start.status()).toBe(201);
    expect((await start.json()).branch).toBe(main);
    // Persisted server-side.
    const after = await (await s.req.get(`${API_BASE}/api/rider/duty`)).json();
    expect(after.active_session.branch).toBe(main);
    await endDutyIfAny(s.req);
    await s.context.close();
  });

  test("C1: a second concurrent active session is prevented (409)", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    await endDutyIfAny(s.req);
    const b = await branches(s.req);
    expect((await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Main Branch"] } })).status()).toBe(201);
    // Second start (same or other branch) while active → 409.
    expect((await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Cheez Gulshan"] } })).status()).toBe(409);
    await endDutyIfAny(s.req);
    await s.context.close();
  });

  // ── C2: offline + switching ────────────────────────────────────────────
  test("C2: end + start at another branch; history preserves sessions", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    await endDutyIfAny(s.req);
    const b = await branches(s.req);
    await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Main Branch"] } });
    // Cannot start elsewhere while online (switch requires going offline first).
    expect((await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Cheez Gulshan"] } })).status()).toBe(409);
    // Go offline, then start at a different branch.
    expect((await s.req.post(`${API_BASE}/api/rider/duty/end`, { data: { reason: "switch" } })).status()).toBe(200);
    expect((await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Cheez Gulshan"] } })).status()).toBe(201);
    // History has both sessions.
    const hist = await (await s.req.get(`${API_BASE}/api/rider/duty/history`)).json();
    expect(hist.results.length).toBeGreaterThanOrEqual(2);
    await endDutyIfAny(s.req);
    await s.context.close();
  });

  test("C2: cannot end duty while a delivery is active", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    const admin = await newSession(browser, "super_admin");
    await endDutyIfAny(s.req);
    const main = (await branches(s.req))["Main Branch"];
    await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main } });
    const riderId = (await (await s.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    const orderId = await readyOrder(browser, main);
    expect((await admin.req.post(`${API_BASE}/api/orders/${orderId}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(200);
    // Active delivery blocks going offline.
    expect((await s.req.post(`${API_BASE}/api/rider/duty/end`, { data: {} })).status()).toBe(409);
    // Cleanup: cancel the order, then end duty.
    await admin.req.post(`${API_BASE}/api/orders/${orderId}/update-status`, { data: { status: "cancelled" } });
    await endDutyIfAny(s.req);
    await admin.context.close(); await s.context.close();
  });

  // ── C3: branch-scoped orders + assignment ──────────────────────────────
  test("C3: assignment requires the rider on active duty for the order's branch", async ({ browser }) => {
    const s = await newSession(browser, "courier2");
    const admin = await newSession(browser, "super_admin");
    await endDutyIfAny(s.req);
    const b = await branches(s.req);
    const riderId = (await (await s.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    // Rider on duty at Main; order at Cheez → assignment rejected (wrong branch).
    await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Main Branch"] } });
    const cheezOrder = await readyOrder(browser, b["Cheez Gulshan"]);
    const wrongBranch = await admin.req.post(`${API_BASE}/api/orders/${cheezOrder}/assign-rider`, { data: { rider_id: riderId } });
    expect(wrongBranch.status()).toBe(400);
    // Offline rider cannot be assigned either.
    await endDutyIfAny(s.req);
    const mainOrder = await readyOrder(browser, b["Main Branch"]);
    expect((await admin.req.post(`${API_BASE}/api/orders/${mainOrder}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(400);
    // On duty at Main → assignment to a Main order succeeds; eligible-orders scoped.
    await s.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: b["Main Branch"] } });
    expect((await admin.req.post(`${API_BASE}/api/orders/${mainOrder}/assign-rider`, { data: { rider_id: riderId } })).status()).toBe(200);
    const eligible = await (await s.req.get(`${API_BASE}/api/rider/eligible-orders`)).json();
    expect(eligible.active_branch).toBe(b["Main Branch"]);
    expect((eligible.results as { id: number }[]).some((o) => o.id === mainOrder)).toBe(true);
    // Cleanup.
    await admin.req.post(`${API_BASE}/api/orders/${mainOrder}/update-status`, { data: { status: "cancelled" } });
    await endDutyIfAny(s.req);
    await admin.context.close(); await s.context.close();
  });

  // ── C4/C5/C6: confirmation + chats over a full delivery ─────────────────
  test("C5/C6: confirm-receive gating, idempotency, chat lifecycle, and 403s", async ({ browser }) => {
    const rider = await newSession(browser, "courier2");
    const admin = await newSession(browser, "super_admin");
    const other = await newSession(browser, "rider"); // seed rider (different rider)
    await endDutyIfAny(rider.req);
    const main = (await branches(rider.req))["Main Branch"];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    await rider.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main } });
    const orderId = await readyOrder(browser, main);

    // Before assignment/confirmation: delivery chat unavailable, picked_up blocked.
    await admin.req.post(`${API_BASE}/api/orders/${orderId}/assign-rider`, { data: { rider_id: riderId } });
    const preChat = await (await rider.req.get(`${API_BASE}/api/orders/${orderId}/delivery-chat`)).json();
    expect(preChat.thread).toBeNull();
    expect((await rider.req.post(`${API_BASE}/api/orders/${orderId}/update-status`, { data: { status: "picked_up" } })).status()).toBe(409);

    // Wrong rider cannot confirm (seed rider is not assigned).
    expect((await other.req.post(`${API_BASE}/api/rider/orders/${orderId}/confirm-receive`)).status()).toBe(403);

    // Assigned rider confirms → 200; a repeat confirm is idempotent (200).
    expect((await rider.req.post(`${API_BASE}/api/rider/orders/${orderId}/confirm-receive`)).status()).toBe(200);
    expect((await rider.req.post(`${API_BASE}/api/rider/orders/${orderId}/confirm-receive`)).status()).toBe(200);

    // Delivery chat now exists; rider + customer can message; another rider is 403.
    const chat = await (await rider.req.get(`${API_BASE}/api/orders/${orderId}/delivery-chat`)).json();
    expect(chat.thread).toBeTruthy();
    const send = await rider.req.post(`${API_BASE}/api/delivery-chat/${chat.thread}/messages`, { data: { body: "On my way" } });
    expect(send.status()).toBe(201);
    expect((await other.req.get(`${API_BASE}/api/delivery-chat/${chat.thread}/messages`)).status()).toBe(403);

    // Now pickup is allowed; deliver → chat closes to new messages.
    for (const st of ["picked_up", "on_the_way", "delivered"]) {
      expect((await rider.req.post(`${API_BASE}/api/orders/${orderId}/update-status`, { data: { status: st } })).status()).toBe(200);
    }
    const closed = await rider.req.post(`${API_BASE}/api/delivery-chat/${chat.thread}/messages`, { data: { body: "late" } });
    expect(closed.status()).toBe(409);
    // History still readable.
    expect((await (await rider.req.get(`${API_BASE}/api/delivery-chat/${chat.thread}/messages`)).json()).results.length).toBeGreaterThan(0);

    await endDutyIfAny(rider.req);
    await admin.context.close(); await rider.context.close(); await other.context.close();
  });

  test("C4: duty chat — membership, message flow, and 403 for others", async ({ browser }) => {
    const rider = await newSession(browser, "courier2");
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    await endDutyIfAny(rider.req);
    const main = (await branches(rider.req))["Main Branch"];
    const riderId = (await (await rider.req.get(`${API_BASE}/api/auth/me`)).json()).id;
    await rider.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main } });

    // BM sees the rider on duty + the duty chat thread.
    const dc = await (await bm.req.get(`${API_BASE}/api/branch-manager/duty-chats`)).json();
    const entry = (dc.results as { rider: number; duty_chat_thread: number }[]).find((r) => r.rider === riderId);
    expect(entry).toBeTruthy();
    const threadId = entry!.duty_chat_thread;

    // Rider and BM can exchange messages; a customer is 403.
    expect((await rider.req.post(`${API_BASE}/api/duty-chat/${threadId}/messages`, { data: { body: "reached branch" } })).status()).toBe(201);
    expect((await bm.req.post(`${API_BASE}/api/duty-chat/${threadId}/messages`, { data: { body: "ok" } })).status()).toBe(201);
    expect((await customer.req.get(`${API_BASE}/api/duty-chat/${threadId}/messages`)).status()).toBe(403);

    // Ending duty closes the chat to new messages; history remains.
    await rider.req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
    expect((await rider.req.post(`${API_BASE}/api/duty-chat/${threadId}/messages`, { data: { body: "after" } })).status()).toBe(409);
    const hist = await (await bm.req.get(`${API_BASE}/api/duty-chat/${threadId}/messages`)).json();
    expect(hist.results.length).toBeGreaterThanOrEqual(2);

    await rider.context.close(); await bm.context.close(); await customer.context.close();
  });
});
