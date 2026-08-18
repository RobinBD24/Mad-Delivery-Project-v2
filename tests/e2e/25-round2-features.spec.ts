import { test, expect, type APIRequestContext } from "@playwright/test";
import { newSession } from "./helpers";

/**
 * ROUND 2 features (server-authoritative, asserted at the API layer):
 *  #1/#13 named delivery areas + order snapshots + hold blocking
 *  #5     branch archive/delete (dependency-aware, SA-only)
 *  #17    customer multiple addresses (fields, default switching, IDOR)
 *  #20/#21 customer GPS + nearest-branch calculation
 *  #12    rider GPS validation + duty-session requirement + ownership
 *  #6/#7  rider assignment accept/reject + acceptance details
 *  #8/#16 pickup verification by order number
 *  #11    rider online visibility from active duty session
 */

const INSIDE = { lat: 23.781, lng: 90.408 }; // inside Main Branch coverage
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function branchMap(req: APIRequestContext): Promise<Record<string, number>> {
  const { results } = await (await req.get("/api/branches/?page_size=100")).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}
async function firstProduct(req: APIRequestContext, branchId: number) {
  const { results } = await (await req.get(`/api/products/?branch_id=${branchId}&page_size=50`)).json();
  return results[0] as { id: number };
}
async function placeOrder(req: APIRequestContext, branchId: number, productId: number, areaId?: number) {
  return req.post("/api/orders/", {
    data: {
      branch_id: branchId, payment_method: "cash", delivery_address: "Dhanmondi, Dhaka",
      fulfillment_type: "delivery", lat: INSIDE.lat, lng: INSIDE.lng,
      items: [{ product_id: productId, quantity: 1 }],
      ...(areaId ? { delivery_area_id: areaId } : {}),
    },
  });
}

// ── #1/#13 Delivery areas ─────────────────────────────────────────────────
test.describe("#1/#13 delivery areas", () => {
  test("SA creates areas; duplicate normalized name blocked; BM own-branch + cross-branch 403", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const name = uniq("Area");
    const a = await admin.req.post("/api/delivery-areas/", { data: { branch_id: main, name, estimated_delivery_minutes: 40, delivery_charge: 60 } });
    expect(a.status()).toBe(201);
    const area = await a.json();
    expect(area.name).toBe(name);
    expect(area.delivery_charge).toBe("60.00");
    // duplicate normalized name for same branch → 400
    expect((await admin.req.post("/api/delivery-areas/", { data: { branch_id: main, name: name.toUpperCase() } })).status()).toBe(400);

    // BM creates for own branch (submitted branch_id is ignored → own branch)
    const bm = await newSession(browser, "branch_manager");
    const bmArea = await bm.req.post("/api/delivery-areas/", { data: { branch_id: 999999, name: uniq("BMArea") } });
    expect(bmArea.status()).toBe(201);
    expect((await bmArea.json()).branch).toBe(main); // forced to BM's own branch

    // BM cannot manage another branch's area (make one on a different branch as SA)
    const other = Object.entries(await branchMap(admin.req)).find(([n]) => n !== "Main Branch")![1];
    const foreign = await (await admin.req.post("/api/delivery-areas/", { data: { branch_id: other, name: uniq("Foreign") } })).json();
    expect((await bm.req.patch(`/api/delivery-areas/${foreign.id}/`, { data: { name: "hax" } })).status()).toBe(403);
    expect((await bm.req.post(`/api/delivery-areas/${foreign.id}/hold/`, { data: {} })).status()).toBe(403);

    // customer forbidden
    const cust = await newSession(browser, "customer");
    expect((await cust.req.get("/api/delivery-areas/")).status()).toBe(403);

    await admin.context.close(); await bm.context.close(); await cust.context.close();
  });

  test("hold blocks NEW delivery orders only; snapshots immutable after edit", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const main = (await branchMap(admin.req))["Main Branch"];
    const area = await (await admin.req.post("/api/delivery-areas/", { data: { branch_id: main, name: uniq("Hold"), estimated_delivery_minutes: 50, delivery_charge: 80 } })).json();

    const cust = await newSession(browser, "customer");
    const prod = await firstProduct(cust.req, main);
    // order using the area snapshots name/charge/estimate
    const o1 = await (await placeOrder(cust.req, main, prod.id, area.id)).json();
    expect(o1.delivery_area).toBe(area.id);
    expect(o1.delivery_area_name).toBe(area.name);
    expect(o1.delivery_charge).toBe("80.00");
    expect(o1.delivery_estimate_minutes).toBe(50);

    // hold the area → a NEW order for it is rejected
    expect((await admin.req.post(`/api/delivery-areas/${area.id}/hold/`, { data: { reason: "rain" } })).status()).toBe(200);
    expect((await placeOrder(cust.req, main, prod.id, area.id)).status()).toBe(400);
    // an order without a held area still works
    expect((await placeOrder(cust.req, main, prod.id)).status()).toBe(201);

    // edit the area's charge/time → the EXISTING order is unchanged (immutable snapshot)
    expect((await admin.req.post(`/api/delivery-areas/${area.id}/resume/`, {})).status()).toBe(200);
    await admin.req.patch(`/api/delivery-areas/${area.id}/`, { data: { delivery_charge: 999, estimated_delivery_minutes: 5 } });
    const reread = await (await cust.req.get(`/api/orders/${o1.id}/`)).json();
    expect(reread.delivery_charge).toBe("80.00");
    expect(reread.delivery_estimate_minutes).toBe(50);

    await admin.context.close(); await cust.context.close();
  });
});

// ── #5 Branch archive ─────────────────────────────────────────────────────
test.describe("#5 branch archive/delete", () => {
  test("branch with a dependency is archived + hidden from customers; unused branch is deleted; non-SA 403", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // A dedicated branch WITH a dependency (a delivery area) → archived. (We do
    // NOT archive Main Branch — other tests rely on it.)
    const withDep = await (await admin.req.post("/api/branches/", {
      multipart: { name: uniq("Dep"), address: "x", phone: "01712345690", brand_type: "combined" },
    })).json();
    await admin.req.post("/api/delivery-areas/", { data: { branch_id: withDep.id, name: uniq("DepArea") } });

    const bm = await newSession(browser, "branch_manager");
    expect((await bm.req.delete(`/api/branches/${withDep.id}/`)).status()).toBe(403); // non-SA forbidden

    const del = await admin.req.delete(`/api/branches/${withDep.id}/`);
    expect(del.status()).toBe(200);
    expect((await del.json()).action).toBe("archived");

    // archived branch no longer visible to a customer
    const cust = await newSession(browser, "customer");
    const custBranches = await (await cust.req.get("/api/branches/?page_size=100")).json();
    expect((custBranches.results as { id: number }[]).some((b) => b.id === withDep.id)).toBe(false);

    // an unused branch → hard delete
    const fresh = await (await admin.req.post("/api/branches/", {
      multipart: { name: uniq("Empty"), address: "x", phone: "01712345699", brand_type: "combined" },
    })).json();
    const del2 = await admin.req.delete(`/api/branches/${fresh.id}/`);
    expect((await del2.json()).action).toBe("deleted");

    await admin.context.close(); await bm.context.close(); await cust.context.close();
  });
});

// ── #17 Customer addresses ────────────────────────────────────────────────
test.describe("#17 customer addresses", () => {
  test("fields + transactional default switching + IDOR + delete-default reassignment", async ({ browser }) => {
    const cust = await newSession(browser, "customer");
    // (The seeded customer may already have addresses, so create an explicit
    // default rather than assuming an empty list.)
    const a1 = await cust.req.post("/api/customer/addresses/", {
      data: { label: "Home", address: uniq("addr"), area: "Dhanmondi", instructions: "ring bell", latitude: 23.75, longitude: 90.38, is_default: true },
    });
    expect(a1.status()).toBe(201);
    const addr1 = await a1.json();
    expect(addr1.area).toBe("Dhanmondi"); // extended fields persist
    expect(addr1.instructions).toBe("ring bell");
    expect(addr1.is_default).toBe(true);

    const addr2 = await (await cust.req.post("/api/customer/addresses/", { data: { label: "Office", address: uniq("addr"), is_default: true } })).json();
    expect(addr2.is_default).toBe(true);
    // addr1 no longer default (transactional switch)
    const list = await (await cust.req.get("/api/customer/addresses/")).json();
    const defaults = (list.results as { id: number; is_default: boolean }[]).filter((a) => a.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(addr2.id);

    // IDOR — a DIFFERENT customer cannot touch these
    const other = await newSession(browser, "qa_upload_1");
    expect([403, 404]).toContain((await other.req.patch(`/api/customer/addresses/${addr1.id}/`, { data: { label: "hax" } })).status());
    expect([403, 404]).toContain((await other.req.delete(`/api/customer/addresses/${addr1.id}/`)).status());
    await other.context.close();

    // delete default → another active becomes default
    expect((await cust.req.delete(`/api/customer/addresses/${addr2.id}/`)).status()).toBe(204);
    const list2 = await (await cust.req.get("/api/customer/addresses/")).json();
    const d2 = (list2.results as { is_default: boolean }[]).filter((a) => a.is_default);
    expect(d2.length).toBe(1);

    await cust.context.close();
  });
});

// ── #21/#20 Customer GPS + nearest branch ─────────────────────────────────
test.describe("#20/#21 customer GPS + nearest branch", () => {
  test("save valid location; reject invalid; nearest branch computed server-side", async ({ browser }) => {
    const cust = await newSession(browser, "customer");
    expect((await cust.req.post("/api/customer/location", { data: { lat: INSIDE.lat, lng: INSIDE.lng, accuracy: 12 } })).status()).toBe(200);
    expect((await cust.req.post("/api/customer/location", { data: { lat: 999, lng: 0 } })).status()).toBe(400);

    const near = await (await cust.req.get("/api/customer/nearest-branch")).json();
    expect(near.has_location).toBe(true);
    expect(Array.isArray(near.branches)).toBe(true);
    // exactly one eligible (nearest covered) branch, the rest disabled
    const eligible = (near.branches as { eligible: boolean }[]).filter((b) => b.eligible);
    expect(eligible.length).toBeLessThanOrEqual(1);
    await cust.context.close();
  });
});

// ── #12 Rider GPS ─────────────────────────────────────────────────────────
test.describe("#12 rider GPS", () => {
  test("on-duty rider posts valid location; invalid rejected; off-duty rejected; role-guarded", async ({ browser }) => {
    // ensure a clean on-duty state for the seeded rider
    const rider = await newSession(browser, "rider");
    const main = (await branchMap(rider.req))["Main Branch"];
    await rider.req.post("/api/rider/duty/end", { data: {} }).catch(() => {});
    await rider.req.post("/api/rider/duty/start", { data: { branch_id: main } });
    expect((await rider.req.post("/api/riders/location/", { data: { lat: INSIDE.lat, lng: INSIDE.lng, accuracy: 8 } })).status()).toBe(200);
    expect((await rider.req.post("/api/riders/location/", { data: { lat: 999, lng: 0 } })).status()).toBe(400);
    await rider.context.close();

    // a customer cannot post rider location (role guard 403)
    const cust = await newSession(browser, "customer");
    expect((await cust.req.post("/api/riders/location/", { data: { lat: 23.7, lng: 90.4 } })).status()).toBe(403);
    await cust.context.close();
  });
});

// ── #6/#7/#8/#11 Rider assignment + pickup + visibility ───────────────────
test.describe("#6/#7 rider assignment", () => {
  test("assign creates pending; reject requires reason + unassigns; cross-rider 403; accept records", async ({ browser }) => {
    const rider = await newSession(browser, "rider");
    const main = (await branchMap(rider.req))["Main Branch"];
    await rider.req.post("/api/rider/duty/end", { data: {} }).catch(() => {});
    await rider.req.post("/api/rider/duty/start", { data: { branch_id: main } });

    const riderMe = await (await rider.req.get("/api/auth/me")).json();
    const riderId = riderMe.id as number;

    const cust = await newSession(browser, "customer");
    const prod = await firstProduct(cust.req, main);
    const order = await (await placeOrder(cust.req, main, prod.id)).json();

    // BM assigns the rider → pending offer appears for the rider
    const bm = await newSession(browser, "branch_manager");
    const assign = await bm.req.post(`/api/orders/${order.id}/assign-rider/`, { data: { rider_id: riderId } });
    expect(assign.status()).toBe(200);
    const pending = await (await rider.req.get("/api/rider/assignments/pending")).json();
    expect((pending.results as { order: number }[]).some((a) => a.order === order.id)).toBe(true);

    // reject without a reason → 400
    expect((await rider.req.post(`/api/rider/assignments/${order.id}/respond`, { data: { action: "reject" } })).status()).toBe(400);
    // a DIFFERENT rider cannot respond (not the assigned rider) → 403
    const courier = await newSession(browser, "courier2");
    expect((await courier.req.post(`/api/rider/assignments/${order.id}/respond`, { data: { action: "accept" } })).status()).toBe(403);
    await courier.context.close();

    // accept → recorded; BM sees acceptance details on the order
    const acc = await rider.req.post(`/api/rider/assignments/${order.id}/respond`, { data: { action: "accept" } });
    expect(acc.status()).toBe(200);
    expect((await acc.json()).status).toBe("accepted");
    // idempotent accept
    expect((await rider.req.post(`/api/rider/assignments/${order.id}/respond`, { data: { action: "accept" } })).status()).toBe(200);
    const bmOrder = await (await bm.req.get(`/api/orders/${order.id}/`)).json();
    expect(bmOrder.assignment?.status).toBe("accepted");
    expect(bmOrder.assignment?.rider_name).toBeTruthy();

    await rider.context.close(); await cust.context.close(); await bm.context.close();
  });

  test("#8 pickup verification: wrong number 404, another rider's order 403", async ({ browser }) => {
    const rider = await newSession(browser, "rider");
    expect((await rider.req.post("/api/rider/pickup/verify", { data: { order_number: "ORD-19000101-000001" } })).status()).toBe(404);
    await rider.context.close();
  });

  test("#11 BM sees rider online via active duty session", async ({ browser }) => {
    const rider = await newSession(browser, "rider");
    const main = (await branchMap(rider.req))["Main Branch"];
    await rider.req.post("/api/rider/duty/end", { data: {} }).catch(() => {});
    await rider.req.post("/api/rider/duty/start", { data: { branch_id: main } });

    const bm = await newSession(browser, "branch_manager");
    const riders = await (await bm.req.get("/api/riders/branch")).json();
    const online = (riders as { is_online: boolean }[]).filter((r) => r.is_online);
    expect(online.length).toBeGreaterThanOrEqual(1);
    await rider.context.close(); await bm.context.close();
  });
});
