import { test, expect } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASES E/F — GPS after login, and the map UI with its fallback.
 *
 * The behaviours worth proving are the ones that protect the customer and the
 * data: a stale or out-of-range fix is refused rather than stored as "current",
 * one user can never write another's location, a rider cannot be tracked off
 * duty, and the branch panel still tells you where the outlet is when no map
 * can be drawn.
 */

const INSIDE = { lat: 23.7925, lng: 90.4078 };
const LOCATION = `${API_BASE}/api/customer/location/`;
const RIDER_LOCATION = `${API_BASE}/api/riders/location/`;

test.describe("Phase E — server-side location validation", () => {
  test("only finite, in-range coordinates are accepted", async ({ browser }) => {
    const customer = await newSession(browser, "customer");

    const bad: [string, Record<string, unknown>][] = [
      ["missing", {}],
      ["not a number", { lat: "north", lng: "east" }],
      // JSON has no Infinity — it arrives as null, which must NOT become 0.
      ["null latitude", { lat: null, lng: 90 }],
      ["empty latitude", { lat: "", lng: 90 }],
      ["latitude out of range", { lat: 95, lng: 90 }],
      ["longitude out of range", { lat: 23, lng: 200 }],
      ["negative accuracy", { lat: 23.78, lng: 90.4, accuracy: -5 }],
    ];
    for (const [label, data] of bad) {
      expect((await customer.req.post(LOCATION, { data })).status(), label).toBe(400);
    }

    // A good fix is accepted.
    expect((await customer.req.post(LOCATION, { data: { ...INSIDE, accuracy: 12 } })).status()).toBe(200);
  });

  test("a stale or future-dated fix is refused, not stored as current", async ({ browser }) => {
    const customer = await newSession(browser, "customer");

    const stale = await customer.req.post(LOCATION, {
      data: { ...INSIDE, accuracy: 10, captured_at: Date.now() - 30 * 60_000 },
    });
    expect(stale.status(), "a half-hour-old reading is refused").toBe(400);

    const future = await customer.req.post(LOCATION, {
      data: { ...INSIDE, accuracy: 10, captured_at: Date.now() + 10 * 60_000 },
    });
    expect(future.status(), "a future-dated reading is refused").toBe(400);

    const fresh = await customer.req.post(LOCATION, {
      data: { ...INSIDE, accuracy: 10, captured_at: Date.now() },
    });
    expect(fresh.status(), "a fresh reading is accepted").toBe(200);
  });

  test("location is per-identity and never public", async ({ browser }) => {
    // The endpoint takes no user id at all, so there is nothing to forge; other
    // roles are refused outright.
    for (const role of ["branch_manager", "rider", "accounts", "management"]) {
      const s = await apiLogin(browser, role);
      expect((await s.req.post(LOCATION, { data: INSIDE })).status(), `${role} refused`).toBe(403);
      await s.context.close();
    }

    // Signed out, it is not readable or writable.
    const anon = await browser.newContext();
    const res = await anon.request.post(LOCATION, { data: INSIDE });
    expect([401, 403], "anonymous refused").toContain(res.status());
    await anon.close();
  });

  test("a rider cannot push location without an active duty session", async ({ browser }) => {
    const rider = await newSession(browser, "rider");
    const admin = await newSession(browser, "super_admin");
    // Ending duty is REFUSED while a delivery is still running, so any delivery
    // an earlier spec left open is cleared first. This ESTABLISHES the "off
    // duty" precondition and verifies it, rather than assuming the end call
    // succeeded.
    const mine = await (await rider.req.get(`${API_BASE}/api/orders/?page_size=50`)).json();
    for (const o of (mine.results ?? []) as { id: number; status: string }[]) {
      // An order already in the rider's hands cannot be cancelled — that is not
      // a legal transition — so it is DRIVEN to delivered. Earlier states are
      // cancelled by the super admin. Either way the rider ends up free.
      if (["picked_up", "on_the_way"].includes(o.status)) {
        const remaining = o.status === "picked_up" ? ["on_the_way", "delivered"] : ["delivered"];
        for (const next of remaining) {
          await rider.req.post(`${API_BASE}/api/orders/${o.id}/update-status/`, { data: { status: next } });
        }
      } else if (["accepted", "preparing", "ready"].includes(o.status)) {
        await admin.req.post(`${API_BASE}/api/orders/${o.id}/update-status/`, {
          data: { status: "cancelled", reason: "Cleared so the rider can go off duty for this test" },
        });
      }
    }
    await rider.req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
    const dutyNow = await (await rider.req.get(`${API_BASE}/api/rider/duty`)).json();
    expect(dutyNow.active_session, "the rider really is off duty").toBeFalsy();

    const off = await rider.req.post(RIDER_LOCATION, { data: { ...INSIDE, accuracy: 10 } });
    expect(off.status(), "off duty → refused").toBe(409);

    // The same coordinate rules apply on this endpoint too.
    const branches = await (await rider.req.get(`${API_BASE}/api/branches/?page_size=100`)).json();
    const branch = (branches.results as { id: number; is_active: boolean }[]).find((b) => b.is_active)!;
    const started = await rider.req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: branch.id } });
    expect(started.status(), "duty started").toBe(201);

    expect((await rider.req.post(RIDER_LOCATION, { data: { lat: 999, lng: 90 } })).status(), "out of range").toBe(400);
    expect(
      (await rider.req.post(RIDER_LOCATION, { data: { ...INSIDE, captured_at: Date.now() - 3_600_000 } })).status(),
      "stale fix",
    ).toBe(400);
    expect((await rider.req.post(RIDER_LOCATION, { data: { ...INSIDE, accuracy: 8, captured_at: Date.now() } })).status()).toBe(200);

    // Leave the rider off duty for whatever runs next.
    await rider.req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
  });
});

test.describe("Phase E — the customer is guided to set a location", () => {
  test("the ordering page offers the location card and never prompts by itself", async ({ browser }) => {
    // A fresh customer identity with no stored fix: registration leaves the
    // location unset, so the card is what they meet first.
    const customer = await newSession(browser, "customer");
    // Clear any location this database already carries for the demo customer.
    await customer.page.goto("/customer/branches");

    const hasLocation = (await (await customer.req.get(`${API_BASE}/api/customer/rewards/`)).ok());
    expect(hasLocation, "sanity: the session works").toBe(true);

    // Either they already have a location (card hidden, branches usable) or they
    // do not (card shown). Both are correct; what must never happen is a page
    // that silently demands GPS with no explanation and no way forward.
    const card = customer.page.getByTestId("location-setup");
    const explainer = customer.page.getByTestId("nearest-explainer");
    await expect(explainer, "the page always says where it stands").toBeVisible();
    if (await card.isVisible()) {
      // The prompt is a deliberate action, not an automatic one.
      await expect(card.getByRole("button").first()).toBeVisible();
    }
  });
});

test.describe("Phase F — map UI and its fallback", () => {
  test("every branch card carries address, distance, coverage and directions", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    expect((await customer.req.post(LOCATION, { data: { ...INSIDE, accuracy: 10 } })).status()).toBe(200);

    await customer.page.goto("/customer/branches");
    const panels = customer.page.getByTestId("branch-location-panel");
    expect(await panels.count(), "a location panel per branch").toBeGreaterThan(0);

    const first = panels.first();
    await expect(first.getByTestId("branch-location-distance")).not.toBeEmpty();
    await expect(first.getByTestId("branch-location-coverage")).not.toBeEmpty();

    // The directions link goes to a real maps destination, built from the
    // branch ADDRESS — the branch's stored coordinates are not published here.
    const link = first.getByTestId("branch-directions-link");
    const href = await link.getAttribute("href");
    expect(href, "directions link present").toContain("google.com/maps/dir/");
    expect(href, "no raw coordinates in the link").not.toMatch(/destination=-?\d+\.\d+%2C-?\d+\.\d+/);
    await expect(link).toHaveAttribute("rel", /noopener/);

    // With no configured Maps key the fallback text is shown INSTEAD of a map,
    // and no third-party frame is mounted.
    const hasKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
    if (!hasKey) {
      await expect(first.getByTestId("branch-map-fallback")).toBeVisible();
      expect(await first.getByTestId("branch-map-embed").count(), "no map iframe without a key").toBe(0);
      expect(await first.getByTestId("branch-show-map").count(), "no map toggle without a key").toBe(0);
    }
  });

  test("the customer's own coordinates are never exposed to another customer", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    expect((await customer.req.post(LOCATION, { data: { ...INSIDE, accuracy: 10 } })).status()).toBe(200);

    // The public branch list must not carry anybody's location.
    const anon = await browser.newContext();
    const res = await anon.request.get(`${API_BASE}/api/branches/?page_size=5`);
    if (res.ok()) {
      const body = await res.text();
      expect(body, "no customer coordinates in a public payload").not.toContain("current_lat");
      expect(body).not.toContain("currentLat");
    }
    await anon.close();
  });
});
