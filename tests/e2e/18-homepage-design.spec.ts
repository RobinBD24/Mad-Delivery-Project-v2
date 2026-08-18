import { test, expect, type Page } from "@playwright/test";
import {
  login,
  setLocale,
  expectHealthy,
  expectNoRawKeys,
  trackConsoleErrors,
  realErrors,
  E2E_PORT,
} from "./helpers";

const BASE = `http://localhost:${E2E_PORT}`;

/**
 * Homepage redesign QA (static_design/landing parity).
 * Covers: render, sections, links, auth-aware header, mobile nav, i18n,
 * theme, responsive overflow, images, screenshots.
 */

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Scroll through the page so every lazy image loads, then return to top. */
async function loadFullPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

test.describe("18 — Homepage design", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("/ returns successfully and renders header + hero + sections", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const res = await page.goto("/");
    expect(res!.status()).toBeLessThan(400);
    await settle(page);

    // Header
    await expect(page.locator("header nav")).toBeVisible();
    await expect(page.locator("header").getByAltText("MAD Delivery")).toBeVisible();
    await expect(page.getByPlaceholder("Search any item across all menus…")).toBeVisible();

    // Hero
    await expect(page.locator("h1")).toContainText(/MAD/);
    await expect(page.locator("h1")).toContainText(/DELIVERY/);
    await expect(page.getByRole("link", { name: "Browse Menu" })).toBeVisible();

    // Major sections
    await expect(page.locator("#menu-section")).toBeAttached();
    await expect(page.getByRole("heading", { name: /CALL TO ORDER/i })).toBeAttached();
    await expect(page.getByRole("heading", { name: /Operating Hours/i })).toBeAttached();
    await expect(page.getByRole("heading", { name: /Our Branches & Coverage/i })).toBeAttached();
    await expect(page.locator("footer")).toContainText("MAD");
    await expect(page.locator("footer")).toContainText("Robin Security");

    // Menu content actually rendered
    await expect(page.getByText("Margherita").first()).toBeAttached();

    await expectHealthy(page);
    expect(realErrors(errors), "console errors on /").toEqual([]);
  });

  test("public header shows Login (and menu shows Register) when logged out", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page.getByRole("link", { name: "Login" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    // Register lives in the mobile menu + hero/footer
    await expect(page.locator("footer").getByRole("link", { name: /account/i })).toBeVisible();
  });

  test("public buttons link to valid routes (no dead internal links)", async ({ page, request }) => {
    await page.goto("/");
    await settle(page);
    await loadFullPage(page);

    const hrefs: string[] = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(5);
    // No placeholder links anywhere
    expect(hrefs.filter((h) => h === "#" || h === "")).toEqual([]);

    const internal = [...new Set(hrefs.filter((h) => h.startsWith("/")))];
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5 });
      expect(res.status(), `dead internal link: ${href}`).toBeLessThan(400);
    }
    // Anchor links must have matching targets
    const anchors = [...new Set(hrefs.filter((h) => h.startsWith("#")))];
    for (const anchor of anchors) {
      const count = await page.locator(`[id="${anchor.slice(1)}"]`).count();
      expect(count, `missing anchor target ${anchor}`).toBeGreaterThan(0);
    }
  });

  test("no broken images on the homepage", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await loadFullPage(page);
    const broken = await page.$$eval("img", (imgs) =>
      imgs
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute("src") ?? "?"),
    );
    expect(broken, "broken images").toEqual([]);
  });

  test("logged-in customer sees Dashboard + cart, no Login/Register", async ({ page }) => {
    await login(page, "customer");
    await page.goto("/");
    await settle(page);
    const nav = page.locator("header nav");
    // The nav link labelled "Dashboard" points at the DASHBOARD, even though a
    // customer's post-login landing is the ordering flow (PHASE O).
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/customer/dashboard");
    await expect(nav.getByRole("button", { name: "Cart" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Login" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Registration" })).toHaveCount(0);
    // profile dropdown trigger (avatar) present
    await expect(page.locator("header nav img[alt], header nav [class*=avatar], header nav button:has(svg)").first()).toBeVisible();
  });

  test("logged-in super_admin sees Dashboard → /admin/dashboard", async ({ page }) => {
    await login(page, "super_admin");
    await page.goto("/");
    await settle(page);
    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
    await expect(nav.getByRole("link", { name: "Login" })).toHaveCount(0);
  });

  test("nav stays sticky while scrolling the menu; tab bar pins beneath it", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 2600));
    await page.waitForTimeout(300);
    const pos = await page.evaluate(() => {
      const nav = document.querySelector("header nav");
      const tab = [...document.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).position === "sticky" && d.textContent!.includes("Madchef") && d.clientHeight < 120,
      );
      return {
        navTop: nav?.getBoundingClientRect().top ?? -1,
        navHeight: nav?.getBoundingClientRect().height ?? 0,
        tabTop: tab?.getBoundingClientRect().top ?? -1,
      };
    });
    expect(pos.navTop, "nav pinned to viewport top").toBe(0);
    expect(Math.abs(pos.tabTop - pos.navHeight), "tab bar pinned right under nav").toBeLessThanOrEqual(2);
  });

  test("mobile navigation opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settle(page);
    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const menuLink = page.locator("header").getByRole("link", { name: /Login/ });
    await expect(menuLink).toBeVisible();
    await toggle.click();
    await expect(menuLink).toBeHidden();
  });

  test("EN mode renders English UI", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page.locator("body")).toContainText("Browse Menu");
    await expect(page.locator("body")).toContainText("Operating Hours");
    await expectNoRawKeys(page);
  });

  test("BN mode renders Bangla UI and persists after refresh + navigation", async ({ page, context }) => {
    await setLocale(context, "bn");
    await page.goto("/");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("body")).toContainText("মেনু দেখুন"); // Browse Menu
    await expect(page.locator("body")).toContainText("খোলার"); // Operating hours title
    await expectNoRawKeys(page);

    await page.reload();
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("body")).toContainText("মেনু দেখুন");

    // language switcher persists via cookie across navigation
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  });

  test("theme cookie switches the html theme without breaking the homepage", async ({ page, context }) => {
    await context.addCookies([{ name: "mad_theme", value: "dark", url: BASE }]);
    await page.goto("/");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectHealthy(page);

    await context.addCookies([{ name: "mad_theme", value: "light", url: BASE }]);
    await page.goto("/");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // homepage stays its designed dark palette and readable
    await expect(page.locator("h1")).toBeVisible();
    await expectHealthy(page);
  });

  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    test(`${label} (${width}px) has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await settle(page);
      await loadFullPage(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(0);
    });
  }

  test("menu interaction: brand switch, item modal, cart drawer", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");
    await settle(page);
    await page.locator("#menu-section").scrollIntoViewIfNeeded();

    // open pizza modal
    await page.getByRole("button", { name: /Margherita/ }).first().click();
    await expect(page.getByText("Sizes & Prices")).toBeVisible();
    await page.getByRole("button", { name: /Add to Cart/ }).click();
    await expect(page.getByText("Added to cart")).toBeVisible();

    // cart drawer
    await page.locator("header nav button").filter({ hasText: "🛒" }).first().click();
    const drawer = page.locator('div[role="dialog"]', { hasText: "Your Order" });
    await expect(drawer.getByText(/Your Order/).first()).toBeVisible();
    await expect(drawer.getByText("Margherita").first()).toBeVisible();
    await drawer.getByRole("button", { name: /close/i }).click();
    await expect(drawer).toHaveCount(0);

    expect(realErrors(errors), "console errors during interaction").toEqual([]);
  });

  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    test(`screenshot: homepage ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      // Freeze the clock so the live branch-status labels (whose TEXT length
      // affects page height, defeating the pixel mask) render deterministically.
      await page.clock.install();
      await page.clock.setFixedTime(new Date("2026-07-18T13:00:00.000Z"));
      await page.goto("/");
      await settle(page);
      await page.addStyleTag({ content: DISABLE_MOTION_CSS });
      await loadFullPage(page);
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`homepage-${label}.png`, {
        fullPage: true,
        mask: [page.getByTestId("cutoff-countdown"), page.getByTestId("branch-status")],
        maxDiffPixelRatio: 0.02,
        timeout: 30_000,
      });
    });
  }
});
