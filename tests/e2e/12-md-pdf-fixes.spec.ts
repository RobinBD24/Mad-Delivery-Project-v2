import { test, expect, type Page } from "@playwright/test";
import { login, newSession, setLocale, API_BASE, PASSWORD } from "./helpers";

/**
 * Coverage for the MD PROJECT FEATURES LIST punch-list fixes:
 * forgot-password, delete-account, per-label address icons, split reservation
 * date/time, super-admin-only category creation, and the offline-rider guard.
 */

test.describe("Forgot Password (customer punch-list #1)", () => {
  async function fillReset(page: Page, email: string) {
    await page.fill('input[name="username"]', "customer");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.fill('input[name="confirm_password"]', PASSWORD);
    await page.click('button[type="submit"]');
  }

  test("login exposes a forgot-password link that opens the reset page", async ({ page, context }) => {
    await setLocale(context, "en");
    await page.goto("/login");
    const link = page.getByRole("link", { name: /forgot password/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password/);
    for (const name of ["username", "email", "password", "confirm_password"]) {
      await expect(page.locator(`input[name="${name}"]`)).toBeVisible();
    }
  });

  test("wrong identity is rejected", async ({ page, context }) => {
    await setLocale(context, "en");
    await page.goto("/forgot-password");
    await fillReset(page, "wrong@example.com");
    // Scope to the form's error alert (Next's route-announcer also has role=alert).
    await expect(page.getByText(/could not verify this account/i)).toBeVisible();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("correct identity resets the password and signs in", async ({ page, context }) => {
    await setLocale(context, "en");
    await page.goto("/forgot-password");
    // Reset to the SAME password so the other specs keep working.
    await fillReset(page, "customer@example.com");
    await page.waitForURL(/\/login\?reset=1/, { timeout: 20_000 });
    await expect(page.getByText(/password reset/i)).toBeVisible();
    await login(page, "customer");
  });
});

test.describe("Delete My Account (customer punch-list #13)", () => {
  test("settings shows a delete-account control that opens a confirm dialog", async ({ browser }) => {
    const { page, context } = await newSession(browser, "customer");
    await page.goto("/customer/settings");
    const del = page.getByRole("button", { name: /delete my account/i }).first();
    await expect(del).toBeVisible();
    await del.click();
    // Confirm modal appears — cancel it (do NOT actually delete the demo user).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/cannot be undone/i)).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(page).toHaveURL(/\/customer\/settings/);
    await context.close();
  });
});

test.describe("Address icons differ per label (customer punch-list #4)", () => {
  test("Home and Office addresses render distinct icons", async ({ browser }) => {
    const { page, context } = await newSession(browser, "customer");
    await page.goto("/customer/addresses");

    // Create Home + Office (idempotent enough for a demo run).
    for (const preset of [/^home$/i, /^office$/i]) {
      await page.getByRole("button", { name: /new address/i }).first().click();
      await page.getByRole("button", { name: preset }).click();
      await page.locator("textarea").fill("123 Test Road, Dhaka");
      await page.getByRole("button", { name: /^save$/i }).click();
      await page.waitForTimeout(600);
    }

    // Collect the SVG path shapes used by the address-card icons.
    const paths = await page.locator("ul li .rounded-lg svg path").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("d")),
    );
    const distinct = new Set(paths.filter(Boolean));
    expect(distinct.size).toBeGreaterThan(1); // icons are no longer all identical
    await context.close();
  });
});

test.describe("Reservation split date & time (customer punch-list #9)", () => {
  test("reservation form has separate date and time inputs", async ({ browser }) => {
    const { page, context } = await newSession(browser, "customer");
    await page.goto("/customer/reservations");
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.locator('input[type="time"]')).toBeVisible();
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
    await context.close();
  });
});

test.describe("Category creation is super-admin only (roles spec)", () => {
  test("branch manager POST /api/categories → 403", async ({ browser }) => {
    const { page, context } = await newSession(browser, "branch_manager");
    const res = await page.request.post(API_BASE + "/api/categories", {
      data: { name: "Illegal Category" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("super admin can create a category", async ({ browser }) => {
    const { page, context } = await newSession(browser, "super_admin");
    const branches = await page.request.get(API_BASE + "/api/branches/");
    const bJson = await branches.json();
    const branchId = (bJson.results ?? bJson)[0].id;
    const res = await page.request.post(API_BASE + "/api/categories", {
      data: { name: `QA Cat ${Date.now()}`, branch_id: branchId },
    });
    expect(res.ok()).toBeTruthy();
    await context.close();
  });
});

test.describe("Offline rider cannot be assigned (rider spec)", () => {
  test("assign fails while offline, succeeds while online", async ({ browser }) => {
    // Discover an order + the branch rider's user id via the BM session.
    const bm = await newSession(browser, "branch_manager");
    const ridersRes = await bm.page.request.get(API_BASE + "/api/riders/branch");
    const riders = await ridersRes.json();
    expect(Array.isArray(riders) && riders.length).toBeTruthy();
    const riderUserId = riders[0].user;

    const ordersRes = await bm.page.request.get(API_BASE + "/api/orders/?page_size=1");
    const orders = await ordersRes.json();
    const order = orders.results[0];
    const orderId = order.id;

    // Rider goes offline. Ending duty is REFUSED while a delivery is still
    // running, so any delivery an earlier spec left open is cleared first —
    // this establishes the test's precondition instead of assuming it, and the
    // result is verified rather than hoped for.
    const riderSess = await newSession(browser, "rider");
    const active = await (await riderSess.page.request.get(API_BASE + "/api/orders/?page_size=50")).json();
    for (const o of (active.results ?? []) as { id: number; status: string }[]) {
      if (["accepted", "preparing", "ready", "picked_up", "on_the_way"].includes(o.status)) {
        await bm.page.request.post(API_BASE + `/api/orders/${o.id}/update-status`, {
          data: { status: "cancelled", reason: "Cleared so the rider can go off duty for this test" },
        });
      }
    }
    await riderSess.page.request.post(API_BASE + "/api/rider/duty/end", { data: {} });
    const duty = await (await riderSess.page.request.get(API_BASE + "/api/rider/duty")).json();
    expect(duty.active_session, "the rider really is off duty").toBeFalsy();

    // Assigning an offline rider (no active session) is rejected.
    const bad = await bm.page.request.post(
      API_BASE + `/api/orders/${orderId}/assign-rider`,
      { data: { rider_id: riderUserId } },
    );
    expect(bad.status()).toBe(400);
    expect(await bad.text()).toContain("rider_id");

    // Rider starts duty on the order's branch → assignment succeeds.
    const start = await riderSess.page.request.post(API_BASE + "/api/rider/duty/start", { data: { branch_id: order.branch } });
    expect(start.ok(), "rider starts duty").toBeTruthy();
    const ok = await bm.page.request.post(
      API_BASE + `/api/orders/${orderId}/assign-rider`,
      { data: { rider_id: riderUserId } },
    );
    expect(ok.ok()).toBeTruthy();

    // Cleanup: cancel so the rider has no dangling active delivery.
    await bm.page.request.post(API_BASE + `/api/orders/${orderId}/update-status`, { data: { status: "cancelled", reason: "Cancelled by branch manager for test" } });

    await bm.context.close();
    await riderSess.context.close();
  });
});
