import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE S — Cash on Delivery + MANUAL bKash.
 *
 * There is no automated bKash gateway: the customer pays the branch's configured
 * number out of band and submits the transaction id, the order becomes
 * pending_verification, and staff verify or reject it. Nothing is ever marked
 * paid automatically.
 */

const INSIDE = { lat: 23.781, lng: 90.408 };
const txn = () => `TRX${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 900 + 100)}`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

async function firstOrderableProduct(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`${API_BASE}/api/products/?branch_id=${branchId}&page_size=50`)).json();
  const list = results as { id: number; variation_type: string }[];
  return list.find((p) => p.variation_type !== "BOTH") ?? list[0];
}

async function placeOrder(
  req: APIRequestContext,
  branchId: number,
  product: { id: number; variation_type: string },
  paymentMethod: "cash" | "bkash",
) {
  return req.post(`${API_BASE}/api/orders/`, {
    data: {
      branch_id: branchId, payment_method: paymentMethod, delivery_address: "Payment test, Dhaka",
      fulfillment_type: "delivery", ...INSIDE,
      items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
    },
  });
}

/** Enable bKash on a branch with a valid number (super admin). */
async function enableBkash(req: APIRequestContext, branchId: number, number = "01711999888") {
  return req.patch(`${API_BASE}/api/branches/${branchId}/payment-settings/`, {
    data: { bkash_number: number, bkash_enabled: true, bkash_instructions: "Send money, then submit the TrxID." },
  });
}

test.describe("Phase S — branch bKash settings", () => {
  test("super admin configures any branch; branch manager only their own", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const otherId = Object.values(await branchMap(admin.req)).find((id) => id !== own)!;
    expect((await enableBkash(admin.req, otherId)).status(), "SA any branch").toBe(200);

    const ownOk = await bm.req.patch(`${API_BASE}/api/branches/${own}/payment-settings/`, {
      data: { bkash_number: "01712345678", bkash_enabled: true },
    });
    expect(ownOk.status(), "BM own branch").toBe(200);
    expect((await ownOk.json()).bkash_enabled).toBe(true);

    const cross = await bm.req.patch(`${API_BASE}/api/branches/${otherId}/payment-settings/`, {
      data: { bkash_enabled: false },
    });
    expect(cross.status(), "BM cross-branch refused").toBe(403);
  });

  test("bKash cannot be enabled without a number, and the number is validated", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    // Clear the number, then try to enable → rejected.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/payment-settings/`, { data: { bkash_number: "" } });
    const noNumber = await admin.req.patch(`${API_BASE}/api/branches/${main}/payment-settings/`, {
      data: { bkash_enabled: true },
    });
    expect(noNumber.status(), "cannot enable without a number").toBe(400);

    const badNumber = await admin.req.patch(`${API_BASE}/api/branches/${main}/payment-settings/`, {
      data: { bkash_number: "12345" },
    });
    expect(badNumber.status(), "invalid BD number rejected").toBe(400);

    expect((await enableBkash(admin.req, main)).status(), "valid number enables").toBe(200);
  });

  test("other roles cannot change payment settings", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    for (const role of ["customer", "rider", "marketing"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.patch(`${API_BASE}/api/branches/${main}/payment-settings/`, {
        data: { bkash_enabled: false },
      });
      expect(res.status(), `${role} refused`).toBe(403);
      await s.context.close();
    }
  });
});

test.describe("Phase S — Cash on Delivery", () => {
  test("a COD order is stored unpaid and is never auto-marked paid", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    const product = await firstOrderableProduct(customer.req, main);

    const placed = await placeOrder(customer.req, main, product, "cash");
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    expect(order.payment_method).toBe("cash");
    expect(order.payment_status, "COD starts unpaid").toBe("unpaid");
    expect(order.bkash_transaction_id, "no transaction on COD").toBe("");
  });

  test("a bKash submission is refused on a COD order", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main);
    const product = await firstOrderableProduct(customer.req, main);
    const order = await (await placeOrder(customer.req, main, product, "cash")).json();

    const res = await customer.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: txn(), payer_phone: "01711111111" },
    });
    expect(res.status(), "not a bKash order").toBe(400);
  });
});

test.describe("Phase S — manual bKash", () => {
  test("submit → pending verification, with the destination number snapshotted", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main, "01711999888");
    const product = await firstOrderableProduct(customer.req, main);
    const order = await (await placeOrder(customer.req, main, product, "bkash")).json();
    expect(order.payment_status, "starts unpaid before submission").toBe("unpaid");

    const id = txn();
    const res = await customer.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: id, payer_phone: "01711111111" },
    });
    expect(res.status()).toBe(200);
    const submitted = await res.json();
    expect(submitted.payment_status, "never auto-paid").toBe("pending_verification");
    expect(submitted.bkash_transaction_id).toBe(id);
    expect(submitted.bkash_destination_number, "destination snapshotted").toBe("01711999888");
    expect(submitted.payment_submitted_at).not.toBeNull();

    // Changing the branch number later must NOT rewrite the snapshot.
    await enableBkash(admin.req, main, "01799000111");
    const reread = await (await customer.req.get(`${API_BASE}/api/orders/${order.id}/`)).json();
    expect(reread.bkash_destination_number, "snapshot immutable").toBe("01711999888");
  });

  test("duplicate transaction ids and invalid input are refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main);
    const product = await firstOrderableProduct(customer.req, main);

    const first = await (await placeOrder(customer.req, main, product, "bkash")).json();
    const second = await (await placeOrder(customer.req, main, product, "bkash")).json();
    const id = txn();

    expect((await customer.req.post(`${API_BASE}/api/orders/${first.id}/payment/`, {
      data: { transaction_id: id, payer_phone: "01711111111" },
    })).status()).toBe(200);

    const dup = await customer.req.post(`${API_BASE}/api/orders/${second.id}/payment/`, {
      data: { transaction_id: id, payer_phone: "01711111111" },
    });
    expect(dup.status(), "duplicate transaction id → conflict").toBe(409);

    for (const bad of [{ transaction_id: "", payer_phone: "01711111111" },
                       { transaction_id: "!!", payer_phone: "01711111111" },
                       { transaction_id: txn(), payer_phone: "123" }]) {
      const res = await customer.req.post(`${API_BASE}/api/orders/${second.id}/payment/`, { data: bad });
      expect(res.status(), `invalid ${JSON.stringify(bad)}`).toBe(400);
    }
  });

  test("a customer cannot submit payment for another customer's order", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const other = await newSession(browser, "qa_upload_1");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main);
    const product = await firstOrderableProduct(customer.req, main);
    const order = await (await placeOrder(customer.req, main, product, "bkash")).json();

    const res = await other.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: txn(), payer_phone: "01711111111" },
    });
    expect(res.status(), "IDOR refused").toBe(403);
  });

  test("bKash is refused when the branch has it disabled", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main);
    const product = await firstOrderableProduct(customer.req, main);
    const order = await (await placeOrder(customer.req, main, product, "bkash")).json();

    // Disable, then attempt to submit.
    await admin.req.patch(`${API_BASE}/api/branches/${main}/payment-settings/`, { data: { bkash_enabled: false } });
    const res = await customer.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: txn(), payer_phone: "01711111111" },
    });
    expect(res.status(), "disabled branch refuses bKash").toBe(400);
    await enableBkash(admin.req, main); // restore
  });
});

test.describe("Phase S — verification", () => {
  async function submittedOrder(browser: Parameters<typeof newSession>[0]) {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const main = (await branchMap(admin.req))["Main Branch"];
    await enableBkash(admin.req, main);
    const product = await firstOrderableProduct(customer.req, main);
    const order = await (await placeOrder(customer.req, main, product, "bkash")).json();
    await customer.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: txn(), payer_phone: "01711111111" },
    });
    return { admin, customer, main, orderId: order.id as number };
  }

  test("own-branch manager verifies; verifier and timestamp are recorded", async ({ browser }) => {
    const { orderId } = await submittedOrder(browser);
    const bm = await newSession(browser, "branch_manager");
    const res = await bm.req.post(`${API_BASE}/api/orders/${orderId}/payment/verify/`, { data: { approve: true } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.payment_status).toBe("verified");
    expect(body.payment_verified_by, "verifier recorded").not.toBeNull();
    expect(body.payment_verified_at, "timestamp recorded").not.toBeNull();
  });

  test("rejection requires a reason and stores it exactly as typed", async ({ browser }) => {
    const { orderId } = await submittedOrder(browser);
    const bm = await newSession(browser, "branch_manager");

    const noReason = await bm.req.post(`${API_BASE}/api/orders/${orderId}/payment/verify/`, {
      data: { approve: false },
    });
    expect(noReason.status(), "reason required").toBe(400);

    const reason = "TrxID not found in our bKash statement";
    const rejected = await bm.req.post(`${API_BASE}/api/orders/${orderId}/payment/verify/`, {
      data: { approve: false, reason },
    });
    expect(rejected.status()).toBe(200);
    const body = await rejected.json();
    expect(body.payment_status).toBe("rejected");
    expect(body.payment_rejection_reason, "reason stored verbatim").toBe(reason);
  });

  test("re-deciding an already-decided payment returns 409 (audit preserved)", async ({ browser }) => {
    const { orderId } = await submittedOrder(browser);
    const bm = await newSession(browser, "branch_manager");
    expect((await bm.req.post(`${API_BASE}/api/orders/${orderId}/payment/verify/`, { data: { approve: true } })).status()).toBe(200);
    const again = await bm.req.post(`${API_BASE}/api/orders/${orderId}/payment/verify/`, { data: { approve: false, reason: "changed mind" } });
    expect(again.status(), "cannot overwrite a decision").toBe(409);
  });

  test("cross-branch and unauthorized roles cannot verify", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");
    const bmSession = await newSession(browser, "branch_manager");
    // A dedicated OTHER branch that genuinely covers the delivery point, so the
    // cross-branch assertion is deterministic (accumulated test branches may
    // have no coordinates and could never serve this cart).
    const branchRes = await admin.req.post(`${API_BASE}/api/branches/`, {
      multipart: {
        name: `PayBranch-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        address: "Pay Rd, Dhaka",
        phone: `018${Math.floor(10000000 + Math.random() * 89999999)}`,
        brand_type: "cheez",
        latitude: String(INSIDE.lat),
        longitude: String(INSIDE.lng),
      },
    });
    expect(branchRes.status(), "other branch created").toBe(201);
    const otherBranch = await branchRes.json();
    await enableBkash(admin.req, otherBranch.id);
    const created = await admin.req.post(`${API_BASE}/api/products/`, {
      multipart: {
        branch_id: String(otherBranch.id),
        name: `PayX-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        variation_type: "THICK",
        variations: JSON.stringify([{ name: "Regular", price: 300, isDefault: true, isEnabled: true }]),
      },
    });
    expect(created.status(), "product created on the other branch").toBe(201);
    const product = await created.json();

    const placed = await customer.req.post(`${API_BASE}/api/orders/`, {
      data: {
        branch_id: otherBranch.id, payment_method: "bkash", delivery_address: "Cross branch, Dhaka",
        fulfillment_type: "delivery", ...INSIDE,
        items: [{ product_id: product.id, quantity: 1, variation_type: product.variation_type }],
      },
    });
    expect(placed.status(), "order placed on the other branch").toBe(201);
    const order = await placed.json();
    await customer.req.post(`${API_BASE}/api/orders/${order.id}/payment/`, {
      data: { transaction_id: txn(), payer_phone: "01711111111" },
    });

    const cross = await bmSession.req.post(`${API_BASE}/api/orders/${order.id}/payment/verify/`, { data: { approve: true } });
    expect(cross.status(), "manager of a different branch refused").toBe(403);

    for (const role of ["customer", "rider"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.post(`${API_BASE}/api/orders/${order.id}/payment/verify/`, { data: { approve: true } });
      expect(res.status(), `${role} refused`).toBe(403);
      await s.context.close();
    }
  });
});
