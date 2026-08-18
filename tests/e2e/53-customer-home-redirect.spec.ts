import { test, expect, type Page } from "@playwright/test";
import {
  login,
  newSession,
  setLocale,
  PASSWORD,
  ROLE_HOME,
  ROLE_DASHBOARD,
  atPath,
} from "./helpers";

/**
 * Post-login destination: a CUSTOMER lands on the public homepage "/", every
 * other role keeps its own dashboard, and no callbackUrl can move either of
 * those off-site or into someone else's section.
 *
 * Every assertion compares the parsed PATHNAME, never a regex built from the
 * path string: the customer's destination is "/" and `new RegExp("/$")` would
 * match almost any URL, so a broken redirect could pass silently.
 */

const STAFF = ["super_admin", "management", "marketing", "branch_manager", "accounts", "rider"] as const;

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/** Sign in through the real form with an explicit ?callbackUrl=… */
async function loginWithCallback(page: Page, username: string, callbackUrl: string): Promise<void> {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.fill('input[name="identifier"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Drive to the outcome — "no longer on /login" — rather than a fixed sleep.
  await expect(async () => {
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 8_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("Customer post-login destination", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("email/username + password lands the customer on the public homepage", async ({ page }) => {
    await login(page, "customer");
    expect(pathOf(page), "customer lands on /").toBe("/");
    await expect(page).toHaveURL(atPath("/"));
    // The real homepage, not an error boundary or an empty shell.
    await expect(page.locator("h1")).toBeVisible();
  });

  test("PHONE + password lands the customer on the public homepage", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "01711111111"); // seeded customer phone
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
    expect(pathOf(page)).toBe("/");
  });

  test("the homepage recognizes the signed-in customer", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    // Authenticated state is rendered by the server on "/", so it survives a
    // full document load — this is not a client-only flourish.
    await expect(s.page.getByTestId("profile-menu-trigger")).toBeVisible();
    expect((await s.page.request.get("/api/auth/me")).status()).toBe(200);
    await s.context.close();
  });

  test("the session survives a FULL page refresh on the homepage", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    await s.page.reload({ waitUntil: "load" });
    expect(pathOf(s.page), "refresh keeps the customer on /").toBe("/");
    await expect(s.page.getByTestId("profile-menu-trigger")).toBeVisible();
    expect(
      (await s.context.cookies()).some((c) => c.name.includes("session-token")),
      "session cookie survives the refresh",
    ).toBe(true);
    await s.context.close();
  });

  test("a signed-in customer visiting /login is sent to / — and stays there", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    await s.page.goto("/login");
    await s.page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    // Loop check: settle, then confirm we are still on "/" and not ping-ponging
    // between /, /login and /customer/dashboard.
    await s.page.waitForLoadState("networkidle");
    expect(pathOf(s.page), "no /login ↔ / redirect loop").toBe("/");
    await expect(s.page.getByTestId("profile-menu-trigger")).toBeVisible();
    await s.context.close();
  });

  test("/customer/dashboard still works when opened manually", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    await s.page.goto("/customer/dashboard");
    await s.page.waitForLoadState("networkidle");
    expect(pathOf(s.page), "the dashboard is not redirected away").toBe("/customer/dashboard");
    await expect(s.page.locator("h1")).toBeVisible();
    await s.context.close();
  });

  test("the ordering flow continues from the homepage cart", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    // A signed-in customer must NOT be told to log in at the ordering step —
    // /login would bounce them straight back to "/" (a dead end).
    await s.page.getByTestId("home-cart-button").click();
    const cta = s.page.getByTestId("cart-order-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/customer/branches");
    await cta.click();
    await s.page.waitForURL((u) => u.pathname === "/customer/branches", { timeout: 30_000 });
    await s.context.close();
  });

  test("logout still works from the homepage", async ({ browser }) => {
    const s = await newSession(browser, "customer");
    await s.page.getByTestId("profile-menu-trigger").click();
    await s.page.getByTestId("logout-button").click();
    await s.page.waitForURL("**/login**", { timeout: 20_000 });
    await expect
      .poll(async () => (await s.context.cookies()).some((c) => c.name.includes("session-token")), {
        timeout: 10_000,
      })
      .toBe(false);
    await s.context.close();
  });
});

test.describe("Other roles are unaffected", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  for (const role of STAFF) {
    test(`${role} still lands on ${ROLE_HOME[role]}, never on /`, async ({ page }) => {
      await login(page, role);
      expect(pathOf(page), `${role} keeps its own dashboard`).toBe(ROLE_HOME[role]);
      expect(pathOf(page), `${role} must never land on the public homepage`).not.toBe("/");
    });
  }

  // "Internal" is not enough: "/" is a safe path, but a staff member asking for
  // it must still be put in their own section, not on the storefront.
  for (const role of ["super_admin", "branch_manager", "rider"] as const) {
    test(`${role} with ?callbackUrl=/ is NOT sent to the public homepage`, async ({ page }) => {
      await loginWithCallback(page, role, "/");
      expect(pathOf(page), `${role} stayed out of the storefront`).toBe(ROLE_HOME[role]);
    });
  }
});

test.describe("Callback URL safety", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  const HOSTILE = [
    "https://malicious-site.example",
    "https://malicious-site.example/steal",
    "//malicious-site.example",
    "/\\malicious-site.example",
    "/api/auth/session",
    "http://malicious-site.example",
  ];

  for (const evil of HOSTILE) {
    test(`customer callbackUrl is refused: ${evil}`, async ({ page }) => {
      await loginWithCallback(page, "customer", evil);
      expect(page.url(), "never leaves the site").toContain("localhost");
      expect(pathOf(page), `refused ${evil} → falls back to /`).toBe("/");
    });
  }

  test("a customer is never auto-sent into another role's section", async ({ page }) => {
    await loginWithCallback(page, "customer", "/admin/dashboard");
    expect(pathOf(page), "cross-role callback falls back to /").toBe("/");
  });

  test("a safe, in-section callbackUrl is still honoured", async ({ page }) => {
    await loginWithCallback(page, "customer", "/customer/orders");
    expect(pathOf(page)).toBe("/customer/orders");
  });

  test("an EXPLICIT /customer/dashboard callback is honoured (deep link, not a default)", async ({ page }) => {
    await loginWithCallback(page, "customer", ROLE_DASHBOARD.customer);
    expect(pathOf(page)).toBe("/customer/dashboard");
  });
});
