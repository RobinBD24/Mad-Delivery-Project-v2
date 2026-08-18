import { test, expect } from "@playwright/test";
import { login, setLocale, PASSWORD, ROLE_HOME, atPath } from "./helpers";

/**
 * The approved login design (static_design/login) ported to /login:
 * brand panel, mobile-or-username sign-in, remember me, theme toggle,
 * forgot-password link, register link and the (unconfigured) social buttons.
 */

test.describe("Login design — structure", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("renders the brand panel exactly as designed", async ({ page }) => {
    await page.goto("/login");

    // Brand mark: the real brand logo, linked home (not the mockup's bolt+text)
    const brandMark = page.locator("a.brand-mark");
    await expect(brandMark).toHaveAttribute("href", "/");
    const brandLogo = brandMark.locator("img");
    await expect(brandLogo).toBeVisible();
    expect(await brandLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".brand-eyebrow")).toHaveText(/live tracking/i);
    await expect(page.locator(".brand-headline")).toHaveText(/already on its way/i);
    await expect(page.locator(".brand-sub")).toHaveText(/fast\. secure\. reliable\./i);

    // Two stat tiles
    await expect(page.locator(".brand-stats li")).toHaveCount(2);
    await expect(page.locator(".brand-stats")).toContainText("avg. delivery");
    await expect(page.locator(".brand-stats")).toContainText("rider rating");

    // Hero scene: rider photo (WEBP, actually decoded) + phone mock
    const rider = page.locator(".hero-scene__rider-photo");
    await expect(rider).toBeVisible();
    expect(await rider.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".phone-mock__badge")).toContainText(/order on the way/i);

    // 4-step order stepper with "On the way" active
    await expect(page.locator(".order-stepper__step")).toHaveCount(4);
    await expect(page.locator(".order-stepper__step.is-active")).toHaveText(/on the way/i);
    await expect(page.locator(".order-stepper__step.is-done")).toHaveCount(2);
  });

  test("form panel matches the design", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".form-head h2")).toHaveText(/welcome back/i);
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="remember"]')).toBeAttached();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
    await expect(page.locator(".divider")).toHaveText(/or continue with/i);
    await expect(page.locator(".btn-social")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /register now/i })).toBeVisible();
  });
});

test.describe("Login design — behaviour", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("signs in with a MOBILE NUMBER", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "01711111111"); // seeded customer phone
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => u.pathname === ROLE_HOME.customer, { timeout: 20_000 });
    await expect(page).toHaveURL(atPath(ROLE_HOME.customer));
  });

  test("signs in with a USERNAME", async ({ page }) => {
    await login(page, "customer");
    await expect(page).toHaveURL(atPath(ROLE_HOME.customer));
  });

  test("an unknown mobile number is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "01999999999");
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".auth-alert--error")).toBeVisible();
  });

  test("remember me signs in and is submitted with the form", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "customer");
    await page.fill('input[name="password"]', PASSWORD);
    await page.locator(".checkbox").click();
    await expect(page.locator('input[name="remember"]')).toBeChecked();
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => u.pathname === ROLE_HOME.customer, { timeout: 20_000 });
  });

  test("password eye toggle switches the input type", async ({ page }) => {
    await page.goto("/login");
    const pwd = page.locator('input[name="password"]');
    await expect(pwd).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(pwd).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(pwd).toHaveAttribute("type", "password");
  });

  test("theme toggle switches to dark and persists across a reload", async ({ page }) => {
    await page.goto("/login");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.getByTestId("auth-theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    // Survives navigation (applied pre-paint, so never flashes back to light).
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("social buttons state plainly that they are not configured", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /facebook/i }).click();
    await expect(page.locator(".toast.is-visible")).toContainText(/isn't configured/i);
  });

  test("forgot password link opens the reset page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("register link opens customer registration", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /register now/i }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator('input[name="username"]')).toBeVisible();
  });
});

test.describe("Login design — i18n", () => {
  test("renders Bangla copy in bn locale with no raw keys", async ({ page, context }) => {
    await setLocale(context, "bn");
    await page.goto("/login");
    await expect(page.locator(".brand-eyebrow")).toHaveText(/লাইভ ট্র্যাকিং/);
    await expect(page.locator(".form-head h2")).toHaveText(/আবার স্বাগতম/);
    await expect(page.getByText(/auth\.[a-z]/i)).toHaveCount(0); // no raw translation keys
  });
});
