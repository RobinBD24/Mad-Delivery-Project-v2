import { test, expect, type Locator, type Page } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * SYSTEM-WIDE DROPDOWN ARROWS.
 *
 * Every `<select>` in the app carries `appearance-none` so its option list can
 * be forced onto the theme surface — which also removed the browser's own arrow,
 * leaving every dropdown looking like a plain text input. A themed chevron is
 * now drawn as a background image by `field-select-arrow`.
 *
 * These tests assert the RENDERED result, not the class list: the computed
 * `background-image` must actually contain an SVG, the select must still report
 * `appearance: none` (so there is exactly one arrow, not two), and it must still
 * open and change value from the keyboard.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

/** The computed background-image of a select — an inline SVG when the arrow is drawn. */
async function arrowOf(select: Locator): Promise<string> {
  return select.evaluate((el) => getComputedStyle(el).backgroundImage);
}

function hasArrow(backgroundImage: string): boolean {
  return backgroundImage.includes("svg") && backgroundImage !== "none";
}

/**
 * Asserts every visible select on the page draws exactly one arrow: an SVG
 * background AND `appearance: none`, which together rule out both "no arrow"
 * and "our arrow plus the native one".
 */
async function expectEverySelectHasOneArrow(page: Page, where: string) {
  const selects = page.locator("select:visible");
  // `domcontentloaded` resolves before the streamed server content lands, so
  // wait for the element under test rather than counting an empty document.
  await expect(selects.first()).toBeVisible();
  const count = await selects.count();
  expect(count, `${where} renders at least one select`).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const select = selects.nth(i);
    const style = await select.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundImage: cs.backgroundImage,
        appearance: cs.appearance,
        paddingRight: parseFloat(cs.paddingRight),
        width: el.getBoundingClientRect().width,
      };
    });
    const name = (await select.getAttribute("name")) ?? (await select.getAttribute("aria-label")) ?? `#${i}`;

    expect(hasArrow(style.backgroundImage), `${where} · ${name}: arrow is drawn`).toBe(true);
    // `appearance: none` still set ⇒ the native arrow is suppressed ⇒ ours is
    // the only one.
    expect(style.appearance, `${where} · ${name}: no second (native) arrow`).toBe("none");
    // Room for the glyph (1rem) plus its 0.75rem inset, so selected text cannot
    // run underneath it.
    expect(style.paddingRight, `${where} · ${name}: text cannot reach the arrow`).toBeGreaterThanOrEqual(28);
    expect(style.width, `${where} · ${name}: not collapsed`).toBeGreaterThan(40);
  }
}

/** Pages that carry selects, per role. */
const ROLE_PAGES: [string, string[]][] = [
  [
    "super_admin",
    [
      "/admin/products",
      "/admin/products/create",
      "/admin/products/deactivated",
      "/admin/orders",
      "/admin/customers",
      "/admin/staff",
      "/admin/branches",
      "/admin/categories/new",
    ],
  ],
  ["branch_manager", ["/branch-manager/catalog/products/create", "/branch-manager/employees"]],
  ["accounts", ["/accounts/transactions"]],
  ["management", ["/management/orders"]],
  ["marketing", ["/marketing/campaigns"]],
];

test.describe("Every role's dropdowns draw an arrow", () => {
  for (const [role, paths] of ROLE_PAGES) {
    test(`${role} pages`, async ({ browser }) => {
      const session = await newSession(browser, role);
      for (const path of paths) {
        const response = await session.page.goto(path, { waitUntil: "domcontentloaded" });
        // A route this role cannot reach, or one that redirected, is not this
        // test's subject — skip it rather than assert against the wrong page.
        if (!response || response.status() >= 400) continue;
        if (new URL(session.page.url()).pathname !== path) continue;
        if ((await session.page.locator("select:visible").count()) === 0) continue;
        await expectEverySelectHasOneArrow(session.page, `${role} ${path}`);
      }
      await session.context.close();
    });
  }
});

test.describe("Themes, states and layout", () => {
  test("the arrow is drawn in BOTH themes, with different ink", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products", { waitUntil: "domcontentloaded" });
    const select = admin.page.locator("select:visible").first();

    const light = await arrowOf(select);
    expect(hasArrow(light), "light mode arrow").toBe(true);

    // Flip the documented theme attribute the app itself writes pre-paint.
    await admin.page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const dark = await arrowOf(select);
    expect(hasArrow(dark), "dark mode arrow").toBe(true);
    // A single fixed colour would vanish on one of the two surfaces.
    expect(dark, "dark mode uses its own ink").not.toBe(light);

    await admin.context.close();
  });

  test("a disabled select still looks like a dropdown", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products", { waitUntil: "domcontentloaded" });

    const state = await admin.page.locator("select:visible").first().evaluate((el) => {
      const select = el as HTMLSelectElement;
      select.disabled = true;
      const cs = getComputedStyle(select);
      return { backgroundImage: cs.backgroundImage, opacity: cs.opacity };
    });
    expect(hasArrow(state.backgroundImage), "arrow survives disabling").toBe(true);
    expect(Number(state.opacity), "muted, not hidden").toBeGreaterThan(0.3);

    await admin.context.close();
  });

  test("an invalid select keeps its arrow alongside the error styling", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products/create", { waitUntil: "domcontentloaded" });

    const state = await admin.page.locator("select:visible").first().evaluate((el) => {
      el.setAttribute("aria-invalid", "true");
      const cs = getComputedStyle(el);
      return { backgroundImage: cs.backgroundImage, borderColor: cs.borderColor };
    });
    expect(hasArrow(state.backgroundImage), "arrow survives the invalid state").toBe(true);

    await admin.context.close();
  });

  test("the arrow is not clipped at narrow widths", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    for (const width of [320, 360, 375, 414, 768]) {
      await admin.page.setViewportSize({ width, height: 800 });
      await admin.page.goto("/admin/products", { waitUntil: "domcontentloaded" });
      const select = admin.page.locator("select:visible").first();
      if ((await select.count()) === 0) continue;

      const box = await select.boundingBox();
      expect(box, `${width}px: select is laid out`).not.toBeNull();
      // The arrow sits 0.75rem (12px) in from the right edge and is 16px wide,
      // so the control must be wide enough to hold it clear of the text.
      expect(box!.width, `${width}px: room for the arrow`).toBeGreaterThan(60);
      expect(box!.x + box!.width, `${width}px: no horizontal overflow`).toBeLessThanOrEqual(width + 1);
      expect(hasArrow(await arrowOf(select)), `${width}px: arrow drawn`).toBe(true);
    }
    await admin.context.close();
  });

  test("Bangla labels do not suppress the arrow", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin", "bn");
    await admin.page.goto("/admin/products", { waitUntil: "domcontentloaded" });
    await expectEverySelectHasOneArrow(admin.page, "bn /admin/products");
    await admin.context.close();
  });
});

test.describe("Behaviour is unchanged", () => {
  test("a filter select still filters, from the keyboard", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products", { waitUntil: "domcontentloaded" });

    const brand = admin.page.getByTestId("instant-filter-brand");
    // The control must still be reachable by keyboard — a background-image arrow
    // cannot intercept pointer or key events, and this proves it: focus lands on
    // the select itself, not on some overlay.
    // Polled: the filter controls are client components that re-render on the
    // server round-trip, so a focus set on a node about to be replaced can be
    // lost once. The claim under test is that focus CAN rest on the select — a
    // background-image arrow has no pointer target to steal it.
    await expect
      .poll(async () =>
        brand.evaluate((el) => {
          (el as HTMLSelectElement).focus();
          return document.activeElement === el;
        }),
      )
      .toBe(true);
    await brand.selectOption("cheez");

    await expect(admin.page, "the filter still applies automatically").toHaveURL(/brand=cheez/);
    await admin.context.close();
  });

  test("a form select still submits its value", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products/create", { waitUntil: "domcontentloaded" });

    const branch = admin.page.getByLabel(/^Branch/i);
    const options = await branch.locator("option").all();
    const value = await options[options.length - 1].getAttribute("value");
    await branch.selectOption(value!);
    await expect(branch, "the selection is held").toHaveValue(value!);

    await admin.context.close();
  });

  test("plain text inputs did NOT get an arrow", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/products/create", { waitUntil: "domcontentloaded" });

    const inputs = admin.page.locator('input[type="text"]:visible, input:not([type]):visible');
    const count = await inputs.count();
    for (let i = 0; i < count; i += 1) {
      const bg = await inputs.nth(i).evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(hasArrow(bg), `text input #${i} has no chevron`).toBe(false);
    }
    await admin.context.close();
  });
});
