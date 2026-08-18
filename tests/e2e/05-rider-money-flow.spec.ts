import { test, expect } from "@playwright/test";
import { newSession, API_BASE } from "./helpers";

/** Drive one full delivery so the rider definitely has withdrawable balance. */
async function earnCommission(
  customerReq: import("@playwright/test").APIRequestContext,
  bmReq: import("@playwright/test").APIRequestContext,
  riderReq: import("@playwright/test").APIRequestContext,
) {
  const prod = (await (await customerReq.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
  const riderId = (await (await riderReq.get(`${API_BASE}/api/auth/me`)).json()).id;
  const order = await (
    await customerReq.post(`${API_BASE}/api/orders`, {
      data: { branch_id: prod.branch, payment_method: "cash", delivery_address: "money-flow", lat: 23.781, lng: 90.408, items: [{ product_id: prod.id, quantity: 1 }] },
    })
  ).json();
  for (const s of ["accepted", "preparing", "ready"]) {
    await bmReq.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: s } });
  }
  await bmReq.post(`${API_BASE}/api/orders/${order.id}/assign-rider`, { data: { rider_id: riderId } });
  // C5: rider confirms receipt before starting the delivery workflow.
  await riderReq.post(`${API_BASE}/api/rider/orders/${order.id}/confirm-receive`);
  for (const s of ["picked_up", "on_the_way", "delivered"]) {
    await riderReq.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: s } });
  }
}

test("rider withdrawal → accounts approve → pay → double-pay & reject rules", async ({ browser }) => {
  const rider = await newSession(browser, "rider");
  const accounts = await newSession(browser, "accounts");
  const customer = await newSession(browser, "customer");
  const bm = await newSession(browser, "branch_manager");

  try {
    // guarantee balance (self-sufficient — no skips, no seed assumptions)
    await earnCommission(customer.req, bm.req, rider.req);
    const wallet = await (await rider.req.get(`${API_BASE}/api/rider/wallet`)).json();
    const available = Number(wallet.available_balance);
    expect(available, "rider has withdrawable balance").toBeGreaterThan(0);

    // over-balance request rejected
    expect((await rider.req.post(`${API_BASE}/api/rider/withdrawals`, {
      data: { amount: String(available + 10000), note: "over" },
    })).status(), "over-balance rejected").toBe(400);

    // valid request
    const wd = await (await rider.req.post(`${API_BASE}/api/rider/withdrawals`, {
      data: { amount: "10", note: "e2e" },
    })).json();

    // rider sees a withdrawals table in the UI
    await rider.page.goto("/rider/withdrawals");
    await expect(rider.page.locator("table")).toBeVisible();

    // accounts sees the request
    const list = await (await accounts.req.get(`${API_BASE}/api/accounts/withdrawals`)).json();
    expect(list.results.some((x: { id: number }) => x.id === wd.id)).toBeTruthy();

    // approve → pay
    expect((await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd.id}/decide`, { data: { decision: "approve" } })).status()).toBe(200);
    expect((await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd.id}/decide`, { data: { decision: "pay" } })).status()).toBe(200);
    // paid balance deducted
    const afterPay = await (await rider.req.get(`${API_BASE}/api/rider/wallet`)).json();
    expect(Number(afterPay.paid_amount)).toBeGreaterThanOrEqual(10);
    // double-pay blocked
    expect((await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd.id}/decide`, { data: { decision: "pay" } })).status(), "double-pay blocked").toBe(400);

    // reject-without-reason blocked, reject-with-reason works
    const wd2 = await (await rider.req.post(`${API_BASE}/api/rider/withdrawals`, { data: { amount: "5", note: "e2e2" } })).json();
    expect((await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd2.id}/decide`, { data: { decision: "reject", reason: "" } })).status(), "reject needs reason").toBe(400);
    expect((await accounts.req.post(`${API_BASE}/api/accounts/withdrawals/${wd2.id}/decide`, { data: { decision: "reject", reason: "e2e reason" } })).status(), "reject with reason").toBe(200);
  } finally {
    await rider.context.close();
    await accounts.context.close();
    await customer.context.close();
    await bm.context.close();
  }
});
