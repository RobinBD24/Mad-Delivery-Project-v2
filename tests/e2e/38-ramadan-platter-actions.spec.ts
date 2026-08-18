import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE L — Ramadan platter View / Edit / Delete.
 *
 * The important guarantee is that management actions can never rewrite history:
 * a platter someone has already booked is ARCHIVED rather than deleted, its
 * reservation keeps the immutable snapshot taken at booking time, and an
 * archived platter can no longer be edited at all.
 */

const MENUS = `${API_BASE}/api/ramadan/menus/`;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function makePlatter(req: APIRequestContext, extra: Record<string, string> = {}) {
  const res = await req.post(MENUS, {
    multipart: {
      name: `Platter ${uniq()}`,
      description: "Iftar set",
      price: "1500.00",
      serving_capacity: "4",
      items: JSON.stringify(["Dates", "Haleem"]),
      ...extra,
    },
  });
  expect(res.status(), "platter created").toBe(201);
  return res.json();
}

test.describe("Phase L — view and edit", () => {
  test("a branch manager can view every field and edit it safely", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const platter = await makePlatter(bm.req);

    // View returns the whole record, including the item list.
    const view = await bm.req.get(`${MENUS}${platter.id}/`);
    expect(view.status()).toBe(200);
    const body = await view.json();
    expect(body.name).toBe(platter.name);
    expect(body.description).toBe("Iftar set");
    expect(body.price).toBe("1500.00");
    expect(body.serving_capacity).toBe(4);
    expect(body.items).toEqual(["Dates", "Haleem"]);
    expect(body.is_active).toBe(true);
    expect(body.is_archived).toBe(false);

    // Edit persists and does not disturb the untouched fields.
    const edited = await bm.req.patch(`${MENUS}${platter.id}/`, {
      multipart: { name: `${platter.name} v2`, price: "1750.50", is_active: "false" },
    });
    expect(edited.status()).toBe(200);
    const after = await edited.json();
    expect(after.name).toBe(`${platter.name} v2`);
    expect(after.price).toBe("1750.50");
    expect(after.is_active).toBe(false);
    expect(after.items, "items untouched by a partial edit").toEqual(["Dates", "Haleem"]);

    // A nameless platter is refused.
    expect((await bm.req.patch(`${MENUS}${platter.id}/`, { multipart: { name: "  " } })).status()).toBe(400);

    // Clean up: never booked → really deleted.
    const del = await bm.req.delete(`${MENUS}${platter.id}/`);
    expect(del.status()).toBe(200);
    expect((await del.json()).archived, "an unbooked platter is deleted").toBe(false);
    expect((await bm.req.get(`${MENUS}${platter.id}/`)).status(), "gone").toBe(404);
  });

  test("an inactive platter disappears from the customer's choices", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    const branchId = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const platter = await makePlatter(bm.req);

    // The eligible-menu list is date-scoped, so a date is required for menus
    // to be evaluated at all.
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const visible = async () => {
      const res = await customer.req.get(`${API_BASE}/api/ramadan/available/?branch_id=${branchId}&date=${date}`);
      const data = await res.json();
      return ((data.menus ?? []) as { id: number }[]).some((m) => m.id === platter.id);
    };

    expect(await visible(), "an active platter is offered").toBe(true);
    await bm.req.patch(`${MENUS}${platter.id}/`, { multipart: { is_active: "false" } });
    expect(await visible(), "a deactivated platter is not offered").toBe(false);

    await bm.req.delete(`${MENUS}${platter.id}/`);
  });
});

test.describe("Phase L — cross-branch protection", () => {
  test("another branch's platter cannot be viewed, edited or deleted", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const bm = await newSession(browser, "branch_manager");
    const own = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const { results } = await (await admin.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    const other = (results as { id: number }[]).find((b) => b.id !== own)!;

    const foreign = await makePlatter(admin.req, { branch_id: String(other.id) });
    expect((await bm.req.get(`${MENUS}${foreign.id}/`)).status(), "cross-branch view").toBe(403);
    expect((await bm.req.patch(`${MENUS}${foreign.id}/`, { multipart: { price: "1.00" } })).status(), "cross-branch edit").toBe(403);
    expect((await bm.req.delete(`${MENUS}${foreign.id}/`)).status(), "cross-branch delete").toBe(403);

    for (const role of ["rider", "customer"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.get(`${MENUS}${foreign.id}/`)).status(), `${role} view`).toBe(403);
      expect((await s.req.delete(`${MENUS}${foreign.id}/`)).status(), `${role} delete`).toBe(403);
      await s.context.close();
    }

    await admin.req.delete(`${MENUS}${foreign.id}/`);
  });
});

test.describe("Phase L — a booked platter is archived, never deleted", () => {
  test("archiving preserves the reservation and its immutable snapshot", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const customer = await newSession(browser, "customer");
    const branchId = (await (await bm.req.get(`${API_BASE}/api/dashboard/branch-manager/`)).json()).branch.id;
    const platter = await makePlatter(bm.req, { price: "2100.00" });

    // Book it. The reservation snapshots the platter as it is right now.
    const bookingDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const available = await (await customer.req.get(
      `${API_BASE}/api/ramadan/available/?branch_id=${branchId}&date=${bookingDate}`,
    )).json();
    const slotId = (available.slots ?? [])[0]?.id;
    const table = (available.tables ?? []).find((t: { seats: number }) => t.seats >= 4);
    expect(slotId, "a bookable slot exists").toBeTruthy();
    expect(table, "a table seating the party exists").toBeTruthy();

    // A booking with no slot/table must be a field error, never a 500.
    const malformed = await customer.req.post(`${API_BASE}/api/ramadan/reservations/`, {
      data: { branch_id: branchId, booking_date: bookingDate, guest_name: "X", guest_phone: "01711111111", party_size: 2 },
    });
    expect(malformed.status(), "missing ids are a validation error").toBe(400);
    const booking = await customer.req.post(`${API_BASE}/api/ramadan/reservations/`, {
      data: {
        branch_id: branchId,
        booking_date: bookingDate,
        slot_id: slotId,
        table_id: table.id,
        guest_name: "Platter Tester",
        guest_phone: "01711111111",
        party_size: 4,
        menu_id: platter.id,
        quantity: 1,
      },
    });
    expect(booking.status(), "reservation created").toBe(201);
    const reservation = await booking.json();
    const snapshotPrice = reservation.menu_unit_price;
    const snapshotName = reservation.menu_name;

    // Deleting it now must ARCHIVE instead.
    const del = await bm.req.delete(`${MENUS}${platter.id}/`);
    expect(del.status()).toBe(200);
    const result = await del.json();
    expect(result.archived, "a booked platter is archived").toBe(true);
    expect(result.reservations).toBeGreaterThanOrEqual(1);
    expect(result.menu.is_active, "archiving also deactivates").toBe(false);

    // The reservation is intact and still carries the original snapshot.
    const mine = await (await customer.req.get(`${API_BASE}/api/ramadan/reservations/?page_size=50`)).json();
    const kept = (mine.results as { id: number; menu_unit_price: string; menu_name: string }[]).find(
      (r) => r.id === reservation.id,
    );
    expect(kept, "reservation preserved").toBeTruthy();
    expect(kept!.menu_unit_price, "snapshot price unchanged").toBe(snapshotPrice);
    expect(kept!.menu_name, "snapshot name unchanged").toBe(snapshotName);

    // Archived: hidden from the default list, retrievable on request, read-only.
    const plain = await (await bm.req.get(`${MENUS}?page_size=100`)).json();
    expect(plain.results.some((m: { id: number }) => m.id === platter.id), "hidden by default").toBe(false);
    const withArchived = await (await bm.req.get(`${MENUS}?include_archived=true&page_size=100`)).json();
    expect(withArchived.results.some((m: { id: number }) => m.id === platter.id), "still listed when asked").toBe(true);
    expect(
      (await bm.req.patch(`${MENUS}${platter.id}/`, { multipart: { price: "1.00" } })).status(),
      "an archived platter cannot be edited",
    ).toBe(409);
  });
});
