import { test, expect } from "@playwright/test";
import {
  login, logout, setLocale, newSession,
  PASSWORD, ROLE_HOME, ROLE_DASHBOARD, API_BASE, atPath,
  expectNoBackendText,
} from "./helpers";

test.describe("Public pages + authentication", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("/ homepage loads with real content", async ({ page }) => {
    const res = await page.goto("/");
    expect(res!.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(/MAD|Delivery|Order|Menu/i);
    await expectNoBackendText(page);
  });

  test("/login renders a usable form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("/register renders role choices", async ({ page }) => {
    const res = await page.goto("/register");
    expect(res!.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(/customer|register|account/i);
  });

  for (const role of Object.keys(ROLE_HOME)) {
    test(`login redirects ${role} to ${ROLE_HOME[role]}`, async ({ page }) => {
      await login(page, role);
      await expect(page).toHaveURL(atPath(ROLE_HOME[role]));
      // real dashboard content, not a blank/error page
      await expect(page.locator("h1")).toBeVisible();
    });
  }

  // Full logout contract, per role. Fresh context per test (Playwright default),
  // stable testid selectors, and the topbar logout is a real <form action> —
  // the server answers with a 303 to /login, which waitForURL observes as a
  // hard navigation. No name-based lookups (test 10 renames seeded users).
  for (const role of ["customer", "super_admin"] as const) {
    test(`logout ends the session and returns to /login (${role})`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      // 1–3: clean context → login → authenticated shell is up. A customer now
      // lands on the PUBLIC homepage, which has its own header rather than the
      // dashboard topbar, so the shared signal is the account menu both render.
      await login(page, role);
      await expect(page.getByTestId("profile-menu-trigger")).toBeVisible();
      expect(
        (await context.cookies()).some((c) => c.name.includes("session-token")),
        "session cookie present after login",
      ).toBe(true);

      // 4–7: dropdown → Logout → server 303 → /login.
      const loginOrigin = new URL(page.url()).origin;
      await logout(page);
      expect(new URL(page.url()).origin, "logout must stay on the current request origin").toBe(
        loginOrigin,
      );

      // 9: the session cookie is gone (Auth.js clears it on signOut).
      expect(
        (await context.cookies()).some((c) => c.name.includes("session-token")),
        "session cookie must be cleared by signOut",
      ).toBe(false);

      // 8: a protected page bounces straight back to /login. Uses the role's
      // DASHBOARD, not its landing page: the customer's landing page is now the
      // public homepage, which is (correctly) reachable while logged out and so
      // would prove nothing here.
      await page.goto(`${ROLE_DASHBOARD[role]}`);
      await page.waitForURL("**/login**", { timeout: 15_000 });

      // Protected APIs are 401 without the session.
      expect((await page.request.get("/api/auth/me")).status()).toBe(401);

      // 10: a refresh does not resurrect the session.
      await page.reload();
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator('input[name="identifier"]')).toBeVisible();

      // Theme/locale cookies may survive logout; auth must not — and the flow
      // itself must be console-clean.
      expect(errors).toEqual([]);
    });
  }

  test("wrong password shows error and does not authenticate", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "customer");
    await page.fill('input[name="password"]', "definitely-wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    // The FORM-level banner specifically. A bare getByRole("alert") is a strict
    // -mode violation here: each field also owns an (initially empty) role=alert
    // live region, plus Next's route announcer.
    await expect(page.locator(".auth-alert--error")).toBeVisible();
  });

  test("blocked customer cannot place an order (server-enforced 403)", async ({ browser }) => {
    const context = await browser.newContext();
    await setLocale(context, "en");
    const page = await context.newPage();
    // blocked_customer authenticates (approved) but is blocked from ordering
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "blocked_customer");
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // PHASE O — a customer lands in the ordering flow after signing in.
    await page.waitForURL((u) => u.pathname === ROLE_HOME.customer, { timeout: 20_000 });

    const prod = (await (await page.request.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
    expect(prod).toBeTruthy();
    const res = await page.request.post(`${API_BASE}/api/orders`, {
      data: {
        branch_id: prod.branch,
        payment_method: "cash",
        delivery_address: "blocked test",
        items: [{ product_id: prod.id, quantity: 1 }],
      },
    });
    expect(res.status(), "blocked customer order rejected").toBe(403);
    await context.close();
  });

  test("logged-in staff visiting /login is redirected to own dashboard", async ({ browser }) => {
    const s = await newSession(browser, "accounts");
    await s.page.goto("/login");
    await s.page.waitForURL((u) => u.pathname === ROLE_HOME.accounts, { timeout: 15_000 });
    await expect(s.page).toHaveURL(atPath(ROLE_HOME.accounts));
    await s.context.close();
  });
});
