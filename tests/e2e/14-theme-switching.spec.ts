import { test, expect, type Page } from "@playwright/test";
import { login, logout, setLocale, DEMO_USERS, ROLE_HOME, ROLE_DASHBOARD, atPath } from "./helpers";

/**
 * Global appearance (light / dark / system).
 *
 * The theme lives on <html data-theme>, is persisted in the `mad_theme` cookie
 * and is stamped by the server on first paint — so these tests assert the
 * attribute (what actually drives the CSS) rather than pixel colors.
 */

const html = (page: Page) => page.locator("html");

/** The desktop topbar switcher; the mobile one is a separate testid. */
const switcher = (page: Page) => page.getByTestId("theme-switcher");

async function chooseTheme(page: Page, option: "light" | "dark" | "system") {
  await switcher(page).click();
  await page.getByTestId(`theme-switcher-option-${option}`).click();
}

test.describe("Theme switching — login page", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("defaults to light, switches to dark, and survives a reload", async ({ page }) => {
    await page.goto("/login");
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    await page.getByTestId("auth-theme-toggle").click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(html(page)).toHaveAttribute("data-theme-pref", "dark");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("persists the choice in a cookie so the server renders it on first paint", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByTestId("auth-theme-toggle").click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    const cookie = (await context.cookies()).find((c) => c.name === "mad_theme");
    expect(cookie?.value).toBe("dark");

    // The server (not the client script) must already stamp dark: read the raw
    // HTML so no client JS has run yet. This is what prevents a flash.
    const body = await (await page.request.get("/login")).text();
    expect(body).toContain('data-theme="dark"');
  });
});

test.describe("Theme switching — across login, dashboard and logout", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("a theme picked on /login carries through login into the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("auth-theme-toggle").click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await login(page, "super_admin");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  // Uses `customer`: the logout helper finds the topbar menu by the seeded
  // display name, and customer's is the one that still matches the DB.
  test("changing the theme in the dashboard survives navigation, reload and logout", async ({
    page,
  }) => {
    await login(page, "customer");
    // A customer now LANDS on the public storefront, which carries its own
    // fixed brand design and no appearance switcher. This test is about the
    // DASHBOARD shell, so go to the page that owns the control; every
    // persistence assertion below is unchanged.
    await page.goto(ROLE_DASHBOARD.customer);
    await chooseTheme(page, "dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    // Route change
    await page.goto("/customer/orders");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    // Reload
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    // Logout returns to /login — the choice must still be there.
    await logout(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("switching back to light also persists", async ({ page }) => {
    await login(page, "super_admin");
    await chooseTheme(page, "dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await chooseTheme(page, "light");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });

  test("system preference follows the OS setting", async ({ page }) => {
    await login(page, "super_admin");
    await chooseTheme(page, "system");
    await expect(html(page)).toHaveAttribute("data-theme-pref", "system");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});

test.describe("Theme switching — every role", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  for (const role of DEMO_USERS) {
    test(`${role} gets the themed shell and can switch appearance`, async ({ page }) => {
      await login(page, role);
      await expect(page).toHaveURL(atPath(ROLE_HOME[role]));

      // "The themed shell" is the dashboard shell. For every staff role that IS
      // the landing page; a customer lands on the public storefront, so step
      // into their dashboard before exercising the switcher.
      if (ROLE_DASHBOARD[role] !== ROLE_HOME[role]) await page.goto(ROLE_DASHBOARD[role]);

      await chooseTheme(page, "dark");
      await expect(html(page)).toHaveAttribute("data-theme", "dark");

      // The shell must actually repaint, not just flip an attribute. Polled
      // because body has a 0.3s background transition — reading it immediately
      // catches an interpolated mid-transition color.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe("rgb(10, 12, 16)"); // mockup --bg (#0a0c10)
    });
  }
});

test.describe("Theme switching — does not break other features", () => {
  test("language switcher still works while a theme is set", async ({ page, context }) => {
    await setLocale(context, "en");
    await login(page, "super_admin");
    await chooseTheme(page, "dark");

    // Switch to Bangla; the switcher reloads the page.
    await page.locator("header").getByRole("button", { name: "বাংলা" }).click();
    await expect(html(page)).toHaveAttribute("lang", "bn");
    // Theme must survive the language change.
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("theme labels are translated in both languages (no raw keys)", async ({ page, context }) => {
    await setLocale(context, "en");
    await login(page, "super_admin");

    await switcher(page).click();
    await expect(page.getByTestId("theme-switcher-option-light")).toHaveText(/light/i);
    await expect(page.getByTestId("theme-switcher-option-dark")).toHaveText(/dark/i);
    await expect(page.getByTestId("theme-switcher-option-system")).toHaveText(/system/i);
    await page.keyboard.press("Escape");

    await context.addCookies([
      { name: "mad_locale", value: "bn", url: page.url().split("/").slice(0, 3).join("/") },
    ]);
    await page.reload();
    await switcher(page).click();
    await expect(page.getByTestId("theme-switcher-option-light")).toHaveText("লাইট");
    await expect(page.getByTestId("theme-switcher-option-dark")).toHaveText("ডার্ক");
    await expect(page.getByTestId("theme-switcher-option-system")).toHaveText("সিস্টেম");
    // No untranslated dotted keys leaked into the menu.
    await expect(page.getByRole("menu")).not.toContainText("theme.");
  });

  test("switching theme logs no console errors", async ({ page, context }) => {
    await setLocale(context, "en");
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await login(page, "super_admin");
    await chooseTheme(page, "dark");
    await page.goto("/admin/users");
    await chooseTheme(page, "light");

    expect(errors).toEqual([]);
  });
});
