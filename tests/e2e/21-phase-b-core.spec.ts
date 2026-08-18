import { test, expect, type APIRequestContext } from "@playwright/test";
import { newSession } from "./helpers";

/**
 * PHASE B CORE — delivery zones + nearest pickup (B1), prep-time snapshot (B2),
 * graphical tables + reservations (B3), branch employees (B5), attendance (B6).
 * Server rules (coverage, capacity, double-booking, IDOR, uniqueness) are the
 * source of truth, so they are asserted at the API layer; a few UI smoke checks
 * confirm the pages render.
 */

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const FUTURE = "2030-03-15T19:00";
const FUTURE2 = "2030-03-15T19:30"; // within the 2h overlap window of FUTURE

async function branches(req: APIRequestContext) {
  const { results } = await (await req.get("/api/branches/?page_size=100")).json();
  const map: Record<string, number> = {};
  for (const b of results as { id: number; name: string }[]) map[b.name] = b.id;
  return map;
}

test.describe("Phase B Core", () => {
  // ── B1 delivery coverage + nearest pickup ──────────────────────────────
  test("B1: address inside coverage allowed, outside returns nearest pickup", async ({ browser }) => {
    const { context, req } = await newSession(browser, "customer");
    const main = (await branches(req))["Main Branch"];
    const inside = await (await req.post("/api/delivery/coverage", { data: { branch_id: main, lat: 23.781, lng: 90.408 } })).json();
    expect(inside.covered).toBe(true);
    const outside = await req.post("/api/delivery/coverage", { data: { branch_id: main, lat: 23.95, lng: 90.62 } });
    const out = await outside.json();
    expect(out.covered).toBe(false);
    expect(out.nearest_pickup).toBeTruthy();
    expect(out.nearest_pickup.distance_km).toBeGreaterThan(0);
    await context.close();
  });

  test("B1: checkout revalidates coverage — out-of-zone delivery is rejected", async ({ browser }) => {
    const { context, req } = await newSession(browser, "customer");
    const main = (await branches(req))["Main Branch"];
    const products = await (await req.get(`/api/products/?branch_id=${main}&page_size=50`)).json();
    const prod = products.results[0];
    const order = await req.post("/api/orders/", {
      data: {
        branch_id: main, payment_method: "cash", delivery_address: "Far away, Dhaka",
        fulfillment_type: "delivery", lat: 23.95, lng: 90.62,
        items: [{ product_id: prod.id, quantity: 1 }],
      },
    });
    expect(order.status()).toBe(400); // outOfCoverage
    await context.close();
  });

  test("B1: delivery checkout without coordinates is rejected; pickup allowed without coords", async ({ browser }) => {
    const { context, req } = await newSession(browser, "customer");
    const main = (await branches(req))["Main Branch"];
    const prod = (await (await req.get(`/api/products/?branch_id=${main}&page_size=50`)).json()).results[0];
    const base = { branch_id: main, payment_method: "cash", delivery_address: "No coords, Dhaka", items: [{ product_id: prod.id, quantity: 1 }] };

    // Delivery WITHOUT coordinates → 400 (coverage can't be bypassed).
    const noCoords = await req.post("/api/orders/", { data: { ...base, fulfillment_type: "delivery" } });
    expect(noCoords.status()).toBe(400);
    // Delivery with out-of-range coordinates → 400.
    const badCoords = await req.post("/api/orders/", { data: { ...base, fulfillment_type: "delivery", lat: 999, lng: 90.4 } });
    expect(badCoords.status()).toBe(400);
    // Pickup WITHOUT coordinates → allowed (uses the pickup branch).
    const pickup = await req.post("/api/orders/", { data: { ...base, fulfillment_type: "pickup" } });
    expect(pickup.status()).toBe(201);
    expect((await pickup.json()).fulfillment_type).toBe("pickup");
    await context.close();
  });

  test("B1: branch manager cannot edit another branch's zone (403 IDOR)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cheez = (await branches(admin.req))["Cheez Gulshan"];
    // SA creates a zone on Cheez Gulshan.
    const zone = await (await admin.req.post("/api/delivery-zones/", { data: { branch_id: cheez, name: `Z${uniq()}`, center_lat: 23.79, center_lng: 90.41, radius_km: 2 } })).json();
    const bm = await newSession(browser, "branch_manager");
    const res = await bm.req.patch(`/api/delivery-zones/${zone.id}/`, { data: { radius_km: 9 } });
    expect(res.status()).toBe(403);
    // BM also cannot create a zone spoofing another branch id → lands on OWN branch, not cheez.
    const created = await (await bm.req.post("/api/delivery-zones/", { data: { branch_id: cheez, name: `Z${uniq()}`, center_lat: 23.79, center_lng: 90.41, radius_km: 2 } })).json();
    expect(created.branch).not.toBe(cheez);
    await admin.context.close(); await bm.context.close();
  });

  // ── B2 prep-time snapshot ──────────────────────────────────────────────
  test("B2: order snapshots prep time; branch change does not affect existing orders", async ({ browser }) => {
    const cust = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const main = (await branches(cust.req))["Main Branch"];
    const prod = (await (await cust.req.get(`/api/products/?branch_id=${main}&page_size=50`)).json()).results[0];

    // Set a known prep time, place order A.
    await bm.req.patch("/api/branch-manager/delivery-settings", { data: { prep_time_minutes: 30 } });
    const orderA = await (await cust.req.post("/api/orders/", { data: { branch_id: main, payment_method: "cash", delivery_address: "A",  lat: 23.781, lng: 90.408,items: [{ product_id: prod.id, quantity: 1 }] } })).json();
    expect(orderA.prep_time_snapshot).toBe(30);

    // Change branch prep, place order B.
    await bm.req.patch("/api/branch-manager/delivery-settings", { data: { prep_time_minutes: 55 } });
    const orderB = await (await cust.req.post("/api/orders/", { data: { branch_id: main, payment_method: "cash", delivery_address: "B",  lat: 23.781, lng: 90.408,items: [{ product_id: prod.id, quantity: 1 }] } })).json();
    expect(orderB.prep_time_snapshot).toBe(55);

    // Order A unchanged.
    const aAfter = await (await cust.req.get(`/api/orders/${orderA.id}/`)).json();
    expect(aAfter.prep_time_snapshot).toBe(30);

    // Invalid prep time rejected.
    const bad = await bm.req.patch("/api/branch-manager/delivery-settings", { data: { prep_time_minutes: 0 } });
    expect(bad.status()).toBe(400);
    await cust.context.close(); await bm.context.close();
  });

  // ── B3 tables + reservations ───────────────────────────────────────────
  test("B3: capacity + double-booking + rejection-reason enforced server-side", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const cust = await newSession(browser, "customer");
    const main = (await branches(bm.req))["Main Branch"];

    // BM creates a 2-seat table.
    const table = await (await bm.req.post("/api/branch-tables/", { data: { name: `QA-${uniq()}`, seats: 2, pos_x: 10, pos_y: 10 } })).json();
    expect(table.id).toBeTruthy();

    // Capacity violation.
    const tooBig = await cust.req.post("/api/reservations/", { data: { branch_id: main, guest_name: "G", guest_phone: "01700000000", party_size: 5, requested_at: FUTURE, table_id: table.id } });
    expect(tooBig.status()).toBe(400);

    // Valid reservation.
    const resA = await cust.req.post("/api/reservations/", { data: { branch_id: main, guest_name: "G", guest_phone: "01700000000", party_size: 2, requested_at: FUTURE, table_id: table.id } });
    expect(resA.status()).toBe(201);
    const a = await resA.json();

    // Rejection requires a reason.
    const noReason = await bm.req.post(`/api/reservations/${a.id}/status/`, { data: { status: "rejected" } });
    expect(noReason.status()).toBe(400);
    const withReason = await bm.req.post(`/api/reservations/${a.id}/status/`, { data: { status: "rejected", rejection_reason: "Fully booked" } });
    expect(withReason.status()).toBe(200);
    expect((await withReason.json()).rejection_reason).toBe("Fully booked");

    // Accept a fresh reservation, then a second overlapping one is blocked.
    const resB = await (await cust.req.post("/api/reservations/", { data: { branch_id: main, guest_name: "G", guest_phone: "01700000000", party_size: 2, requested_at: FUTURE, table_id: table.id } })).json();
    await bm.req.post(`/api/reservations/${resB.id}/status/`, { data: { status: "accepted" } });
    const resC = await cust.req.post("/api/reservations/", { data: { branch_id: main, guest_name: "G", guest_phone: "01700000000", party_size: 2, requested_at: FUTURE2, table_id: table.id } });
    expect(resC.status()).toBe(400); // double-booking blocked

    await bm.context.close(); await cust.context.close();
  });

  test("B3: cross-branch table + wrong-role are blocked", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cheez = (await branches(admin.req))["Cheez Gulshan"];
    const cheezTable = await (await admin.req.post("/api/branch-tables/", { data: { branch_id: cheez, name: `CH-${uniq()}`, seats: 4 } })).json();
    // BM (Main) cannot edit Cheez's table.
    const bm = await newSession(browser, "branch_manager");
    const idor = await bm.req.patch(`/api/branch-tables/${cheezTable.id}/`, { data: { seats: 8 } });
    expect(idor.status()).toBe(403);
    // Customer cannot create tables.
    const cust = await newSession(browser, "customer");
    const wrongRole = await cust.req.post("/api/branch-tables/", { data: { name: "X", seats: 2 } });
    expect(wrongRole.status()).toBe(403);
    await admin.context.close(); await bm.context.close(); await cust.context.close();
  });

  // ── B5 employees ───────────────────────────────────────────────────────
  test("B5: employee CRUD, duplicate code, activation, cross-branch 403", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const code = `E-${uniq()}`;

    const created = await bm.req.post("/api/employees/", { multipart: { first_name: "Test", last_name: "Emp", employee_code: code, role: "waiter", phone: "01700000000" } });
    expect(created.status()).toBe(201);
    const emp = await created.json();
    expect(emp.role).toBe("waiter");

    // Duplicate code rejected.
    const dup = await bm.req.post("/api/employees/", { multipart: { first_name: "Dup", employee_code: code, role: "chef" } });
    expect(dup.status()).toBe(400);

    // Edit + deactivate.
    const upd = await bm.req.patch(`/api/employees/${emp.id}/`, { multipart: { department: "Kitchen", is_active: "false" } });
    expect(upd.status()).toBe(200);
    expect((await upd.json()).is_active).toBe(false);

    // Cross-branch: SA creates an employee on Cheez, BM (Main) cannot edit it.
    const admin = await newSession(browser, "super_admin");
    const cheez = (await branches(admin.req))["Cheez Gulshan"];
    const foreign = await (await admin.req.post("/api/employees/", { multipart: { branch_id: String(cheez), first_name: "For", employee_code: `F-${uniq()}`, role: "cashier" } })).json();
    const idor = await bm.req.patch(`/api/employees/${foreign.id}/`, { multipart: { department: "hijack" } });
    expect(idor.status()).toBe(403);
    await bm.context.close(); await admin.context.close();
  });

  test("B5: management can read employees but not mutate", async ({ browser }) => {
    const mgmt = await newSession(browser, "management");
    const list = await mgmt.req.get("/api/employees/?page_size=50");
    expect(list.ok()).toBeTruthy();
    const create = await mgmt.req.post("/api/employees/", { multipart: { first_name: "X", employee_code: `M-${uniq()}`, role: "waiter" } });
    expect(create.status()).toBe(403);
    await mgmt.context.close();
  });

  // ── B6 attendance ──────────────────────────────────────────────────────
  test("B6: attendance is one-per-employee-per-date, filters + summary work", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    // Grab an own-branch employee.
    const emp = (await (await bm.req.get("/api/employees/?page_size=50")).json()).results[0];
    expect(emp).toBeTruthy();
    const date = "2029-01-10";

    const first = await bm.req.post("/api/employee-attendance", { data: { employee_id: emp.id, date, status: "present" } });
    expect(first.status()).toBe(201);
    // Same employee+date again updates the SAME row (upsert), not a duplicate.
    const second = await bm.req.post("/api/employee-attendance", { data: { employee_id: emp.id, date, status: "late" } });
    expect(second.status()).toBe(201);

    const filtered = await (await bm.req.get(`/api/employee-attendance?from=${date}&to=${date}&employee_id=${emp.id}`)).json();
    const rows = filtered.results.filter((r: { employee: number; date: string }) => r.employee === emp.id && r.date === date);
    expect(rows).toHaveLength(1); // uniqueness held
    expect(rows[0].status).toBe("late"); // updated
    expect(filtered.summary.late).toBeGreaterThanOrEqual(1);

    // Invalid status rejected.
    const bad = await bm.req.post("/api/employee-attendance", { data: { employee_id: emp.id, date, status: "vacationing" } });
    expect(bad.status()).toBe(400);
    await bm.context.close();
  });

  test("B6: cross-branch attendance is blocked (403)", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cheez = (await branches(admin.req))["Cheez Gulshan"];
    const foreign = await (await admin.req.post("/api/employees/", { multipart: { branch_id: String(cheez), first_name: "Att", employee_code: `A-${uniq()}`, role: "waiter" } })).json();
    const bm = await newSession(browser, "branch_manager");
    const res = await bm.req.post("/api/employee-attendance", { data: { employee_id: foreign.id, date: "2029-02-02", status: "present" } });
    expect(res.status()).toBe(403);
    await admin.context.close(); await bm.context.close();
  });

  // ── UI smoke — Phase B pages render (BM) ───────────────────────────────
  test("UI: BM Phase B pages render without error", async ({ browser }) => {
    const { page, context } = await newSession(browser, "branch_manager");
    for (const path of ["/branch-manager/delivery-zone", "/branch-manager/tables", "/branch-manager/employees", "/branch-manager/attendance"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
    }
    // Graphical table canvas is present with seeded nodes.
    await page.goto("/branch-manager/tables");
    await expect(page.getByTestId("table-canvas")).toBeVisible();
    await expect(page.getByTestId("table-node").first()).toBeVisible();
    await context.close();
  });
});
