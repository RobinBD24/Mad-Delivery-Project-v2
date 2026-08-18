import { test, expect, type Page } from "@playwright/test";
import { setLocale, expectNoRawKeys, trackConsoleErrors, realErrors } from "./helpers";

/**
 * Product customization modal QA (reference: static_design/landing).
 * Deterministic: fixed products (Margherita / Signature Chicken), EN locale,
 * animations disabled before screenshots, dialog-only screenshots (unmasked).
 */

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function openPizzaModal(page: Page): Promise<void> {
  await page.locator("#menu-section").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /Margherita/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function waitForModalImage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const img = dialog?.querySelector("img");
    return Boolean(img && img.complete && img.naturalWidth > 0);
  });
}

test.describe("19 — Product customization modal", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("pizza card opens the two-panel modal with real data", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);

    const dialog = page.getByRole("dialog");
    // dialog semantics
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", /item-modal-title/);

    // two panels: image + content
    const img = dialog.locator("img").first();
    await expect(img).toHaveAttribute("src", /classic-margherita\.webp/);
    await waitForModalImage(page);
    await expect(dialog.getByRole("heading", { name: "Margherita" })).toBeVisible();
    await expect(dialog.getByText("CHEEZ! PIZZA")).toBeVisible();
    await expect(dialog.getByText(/from/i).first()).toBeVisible();
    await expect(dialog.getByText("Topped with original italian tomato sauce", { exact: false }).first()).toBeVisible();

    // About + ingredients from real data
    await expect(dialog.getByText("About", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Cheez + Less Vegetable (Plain Pizza)")).toBeVisible();
    await expect(dialog.getByText("Ingredients")).toBeVisible();

    // size options render with prices
    await expect(dialog.getByRole("radio", { name: /8 inch – Thick & Thin/ })).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /12 inch – Thin Crust/ })).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /14 inch – Thick Crust/ })).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /16 inch – Thin Crust/ })).toBeVisible();

    await expectNoRawKeys(page);
    expect(realErrors(errors), "console errors").toEqual([]);
  });

  test("size selection updates selected state and live total; qty stepper works", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);
    const dialog = page.getByRole("dialog");

    // default = 14 inch → ৳849
    await expect(dialog.getByRole("radio", { name: /14 inch/ })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("849");

    await dialog.getByRole("radio", { name: /16 inch/ }).click();
    await expect(dialog.getByRole("radio", { name: /16 inch/ })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("radio", { name: /14 inch/ })).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("999");

    // qty: + doubles total, − respects min 1
    await dialog.getByRole("button", { name: "Increase quantity" }).click();
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("1,998");
    await dialog.getByRole("button", { name: "Decrease quantity" }).click();
    await dialog.getByRole("button", { name: "Decrease quantity" }).click();
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("999");
  });

  test("clicking a simple item's card body opens a minimal modal (no empty groups)", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.locator("#menu-section").scrollIntoViewIfNeeded();
    const card = page.getByRole("button", { name: "View details for Fettuccine Alfredo" });
    await card.scrollIntoViewIfNeeded();
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Fettuccine Alfredo" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("549");
    // no empty option headings for items without sizes/choices
    await expect(dialog.getByText("Sizes & Prices")).toHaveCount(0);
    await expect(dialog.getByText("Choice of Bun")).toHaveCount(0);
    await dialog.getByRole("button", { name: /Add to Cart/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Added to cart")).toBeVisible();
  });

  test("burger modal: bun/sauce groups + add-ons update total", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.locator("#menu-section").scrollIntoViewIfNeeded();
    await page.locator("button", { hasText: "Madchef" }).filter({ hasText: "branches" }).click();
    await page.getByRole("button", { name: /Signature Chicken/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText("Choice of Bun")).toBeVisible();
    await expect(dialog.getByText("Choice of Sauce")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "Potato Brioche" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("299");

    // Cheese +39 → 338
    await dialog.getByRole("checkbox", { name: /Cheese/ }).first().click();
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("338");
    // uncheck → back to 299
    await dialog.getByRole("checkbox", { name: /Cheese/ }).first().click();
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toContainText("299");
  });

  test("add to cart preserves customizations, updates count, shows toast", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("radio", { name: /16 inch/ }).click();
    await dialog.getByRole("button", { name: "Increase quantity" }).click();
    await dialog.getByRole("button", { name: /Add to Cart/ }).click();

    // modal closes, toast shows, cart badge = 2
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Added to cart")).toBeVisible();
    await expect(page.locator("header nav button").filter({ hasText: "🛒" })).toContainText("2");

    // drawer keeps the variant + line total
    await page.locator("header nav button").filter({ hasText: "🛒" }).first().click();
    const drawer = page.locator('div[role="dialog"]', { hasText: "Your Order" });
    await expect(drawer.getByText("Margherita").first()).toBeVisible();
    await expect(drawer.getByText("16 inch")).toBeVisible();
    await expect(drawer.getByText("1,998").first()).toBeVisible();
  });

  test("close button, Escape, backdrop and focus restore", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);

    // close button
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // focus returned to the triggering card control
    await expect
      .poll(async () => page.evaluate(() => (document.activeElement as HTMLElement)?.getAttribute("aria-label") ?? ""))
      .toContain("Margherita");

    // Escape
    await openPizzaModal(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // backdrop click
    await openPizzaModal(page);
    await page.mouse.click(30, 30);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("keyboard focus stays trapped inside the modal", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);
    for (let i = 0; i < 15; i += 1) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(dialog && dialog.contains(document.activeElement));
    });
    expect(inside, "focus escaped the dialog").toBe(true);
  });

  test("mobile bottom sheet: layout, scroll, sticky bar, no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Margherita" })).toBeVisible();
    // sticky action bar visible without scrolling
    await expect(dialog.getByRole("button", { name: /Add to Cart/ })).toBeInViewport();
    // close always accessible
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("BN mode: modal UI is Bangla with no raw keys", async ({ page, context }) => {
    await setLocale(context, "bn");
    await page.goto("/");
    await settle(page);
    await openPizzaModal(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("সাইজ ও দাম")).toBeVisible(); // Sizes & Prices
    await expect(dialog.getByText("সম্পর্কে")).toBeVisible(); // About
    await expect(dialog.getByRole("button", { name: /কার্টে যোগ করুন/ })).toBeVisible(); // Add to Cart
    await expectNoRawKeys(page);
  });

  for (const [label, width, height] of [
    ["desktop", 1440, 950],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    test(`screenshot: pizza modal ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await settle(page);
      await page.addStyleTag({ content: DISABLE_MOTION_CSS });
      await openPizzaModal(page);
      await waitForModalImage(page);
      await page.waitForTimeout(250);
      await expect(page.getByRole("dialog")).toHaveScreenshot(`product-modal-${label}.png`, {
        maxDiffPixelRatio: 0.02,
        timeout: 30_000,
      });
    });
  }
});
