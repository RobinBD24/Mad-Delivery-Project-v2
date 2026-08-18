import { test, expect } from "@playwright/test";
import { login, setLocale } from "./helpers";

test.describe("Forms & JS validation (English locale)", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  // The login design guards submission by disabling the button until both
  // fields are valid, so an empty form can never be submitted at all.
  test("login: empty form cannot be submitted, stays on /login", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: /log in|sign in/i });
    await expect(submit).toBeDisabled();
    await submit.click({ force: true });
    await expect(page).toHaveURL(/\/login/);
  });

  test("login: invalid identifier shows the inline field error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="identifier"]', "!!");
    await page.locator('input[name="password"]').click(); // blur → touched
    await expect(page.locator('.field[data-field="identifier"]')).toHaveClass(/is-invalid/);
    await expect(page.getByText(/valid mobile number or username/i)).toBeVisible();
    // The submit button renders auth.loginButton ("Sign In"), not "Log in".
    await expect(page.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  test("login: password eye toggle switches type", async ({ page }) => {
    await page.goto("/login");
    const pwd = page.locator('input[name="password"]');
    await expect(pwd).toHaveAttribute("type", "password");
    // the toggle sits inside the password field container, labelled Show/Hide password
    const toggle = page.getByRole("button", { name: /show password/i });
    await toggle.click();
    await expect(pwd).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(pwd).toHaveAttribute("type", "password");
  });

  test("register: empty submit stays on register (JS validation)", async ({ page }) => {
    await page.goto("/register/customer");
    await expect(page.locator('input[name="username"]').first()).toBeVisible();
    await page.locator('form button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("customer address: empty submit → field error", async ({ page }) => {
    await login(page, "customer");
    await page.goto("/customer/addresses");
    await page.getByRole("button", { name: "New Address" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/enter a label|enter the address/i).first()).toBeVisible();
  });

  test("rider withdrawal: invalid amount → error, no navigation", async ({ page }) => {
    await login(page, "rider");
    await page.goto("/rider/withdrawals");
    const form = page.locator("form").first();
    await expect(form).toBeVisible();
    // submit with empty/zero amount
    await form.getByRole("button", { name: /request withdrawal/i }).click();
    await expect(page.getByText(/valid amount|enter/i).first()).toBeVisible();
  });

  test("complaint form: empty submit → recipient error", async ({ page }) => {
    await login(page, "customer");
    await page.goto("/complaints/new");
    await expect(page.locator("form")).toBeVisible();
    await page.getByRole("button", { name: /submit complaint/i }).click();
    await expect(page).toHaveURL(/\/complaints\/new/);
    // an inline validation error (red text) appears — not the <option> placeholder
    await expect(page.locator("p.text-red-600").first()).toBeVisible();
  });

  test("checkout page renders (cart or empty state, no crash)", async ({ page }) => {
    await login(page, "customer");
    const res = await page.goto("/customer/checkout");
    expect(res!.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("marketing coupon create form renders fields", async ({ page }) => {
    await login(page, "marketing");
    const res = await page.goto("/marketing/coupons/create");
    expect(res!.status()).toBeLessThan(400);
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("form input").first()).toBeVisible();
  });
});
