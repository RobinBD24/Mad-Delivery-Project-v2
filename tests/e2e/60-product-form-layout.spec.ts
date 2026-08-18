import { test, expect, type Page } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * PRODUCT FORM LAYOUT.
 *
 * The FORM element itself was `max-w-3xl` — widening the card around it changed
 * nothing, which is why a third of the page stayed blank. The form now fills the
 * content column and splits into a main column (name, description, variations)
 * and a sidebar (organization, pricing, image, visibility, save).
 *
 * Measured from the rendered box model, not from class names.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

const CREATE = "/admin/products/create";

/** Right edge of the form, and of the content column it sits in. */
async function boxes(page: Page) {
  const cardBox = (await page.locator("form").first().boundingBox())!;
  const main = page.locator("main, [id='dashboard-content']").first();
  const mainBox = (await main.boundingBox())!;
  return { cardBox, mainBox };
}

test.describe("The card fills the content column", () => {
  test("no large dead zone beside the form on a wide screen", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });
    await expect(admin.page.getByLabel(/^Product name/i)).toBeVisible();

    const { cardBox, mainBox } = await boxes(admin.page);
    const unusedRight = mainBox.x + mainBox.width - (cardBox.x + cardBox.width);

    // Before: the card stopped at 768px and left ~600px of empty page.
    expect(cardBox.width, "the card is wide").toBeGreaterThan(900);
    expect(unusedRight, "no dead zone on the right").toBeLessThan(80);

    await admin.context.close();
  });

  test("main column and sidebar sit side by side and both are used", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });
    await expect(admin.page.getByLabel(/^Product name/i)).toBeVisible();

    const name = (await admin.page.getByLabel(/^Product name/i).boundingBox())!;
    const branch = (await admin.page.getByLabel(/^Branch/i).boundingBox())!;
    const variations = (await admin.page.getByTestId("variation-row").first().boundingBox())!;

    // Branch lives in the sidebar, to the RIGHT of the main column's fields —
    // two real columns, not one stack with empty space beside it.
    expect(branch.x, "sidebar is right of the main column").toBeGreaterThan(name.x + name.width);
    // And the sidebar starts near the top, so its content runs alongside the
    // variations rather than below everything.
    expect(branch.y, "sidebar starts high").toBeLessThan(variations.y + 200);

    await admin.context.close();
  });

  test("every section card is present and titled", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });

    for (const title of [
      /Basic Information/i,
      /Product Organization/i,
      /Variations/i,
      /Pricing & Preparation/i,
      /Product Image/i,
      /Visibility & Promotion/i,
    ]) {
      await expect(
        admin.page.getByRole("heading", { name: title }),
        `section: ${title}`,
      ).toBeVisible();
    }

    // Variations are numbered so two rows are never confused.
    await expect(admin.page.getByText(/^Variation 1$/i)).toBeVisible();

    await admin.context.close();
  });

  test("the variations editor is no longer squeezed", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });
    await expect(admin.page.getByTestId("variation-price")).toBeVisible();

    const price = (await admin.page.getByTestId("variation-price").boundingBox())!;
    // In the 768px card these inputs collapsed to ~130px. A usable field is
    // wider than that.
    expect(price.width, "price input has room").toBeGreaterThan(150);

    await admin.context.close();
  });

  test("no field is stretched to an unreadable width", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });
    await expect(admin.page.getByLabel(/^Product name/i)).toBeVisible();

    // Removing the cap must not swing the other way: single-line inputs stay in
    // their grid column rather than spanning the whole card.
    for (const field of [
      admin.page.getByLabel(/^Product name/i),
      admin.page.getByLabel(/^Discount/i),
      admin.page.getByLabel(/^Preparation Time/i),
    ]) {
      const box = (await field.boundingBox())!;
      expect(box.width, "input is column-width, not full-bleed").toBeLessThan(700);
    }

    await admin.context.close();
  });
});

test.describe("Responsive and still usable", () => {
  test("no horizontal overflow at narrow widths", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    for (const width of [320, 375, 414, 768, 1024]) {
      await admin.page.setViewportSize({ width, height: 900 });
      await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });
      await expect(admin.page.getByLabel(/^Product name/i)).toBeVisible();

      const overflow = await admin.page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px: no horizontal scroll`).toBeLessThanOrEqual(1);

      const name = (await admin.page.getByLabel(/^Product name/i).boundingBox())!;
      expect(name.x, `${width}px: field starts on screen`).toBeGreaterThanOrEqual(0);
      expect(name.x + name.width, `${width}px: field ends on screen`).toBeLessThanOrEqual(width + 1);
    }
    await admin.context.close();
  });

  test("the EDIT page uses the same structure and keeps its values", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });

    // Any existing product — the edit page must render the same sections.
    const { results } = await (await admin.req.get("/api/products/?page_size=1")).json();
    const product = results[0] as { id: number; name: string };
    await admin.page.goto(`/admin/products/${product.id}/edit`, { waitUntil: "domcontentloaded" });

    for (const title of [
      /Basic Information/i,
      /Product Organization/i,
      /Variations/i,
      /Pricing & Preparation/i,
      /Product Image/i,
      /Visibility & Promotion/i,
    ]) {
      await expect(admin.page.getByRole("heading", { name: title })).toBeVisible();
    }

    // Loaded values survive the restructure.
    await expect(admin.page.getByLabel(/^Product name/i)).toHaveValue(product.name);
    await expect(admin.page.getByTestId("variation-name").first()).not.toHaveValue("");
    // Edit's primary action reads "Save Changes", not "Add Product".
    await expect(admin.page.getByRole("button", { name: /save changes/i })).toBeVisible();

    // Two real columns here too.
    const name = (await admin.page.getByLabel(/^Product name/i).boundingBox())!;
    const prep = (await admin.page.getByLabel(/^Preparation Time/i).boundingBox())!;
    expect(prep.x, "sidebar is right of the main column").toBeGreaterThan(name.x + name.width);

    await admin.context.close();
  });

  test("the form still submits and creates the product", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1500, height: 1000 });
    await admin.page.goto(CREATE, { waitUntil: "domcontentloaded" });

    const name = `LayoutProduct-${Date.now()}`;
    await admin.page.getByLabel(/^Category/i).selectOption({ index: 1 });
    await admin.page.getByLabel(/^Product name/i).fill(name);
    await admin.page.getByTestId("variation-name").fill("Regular");
    await admin.page.getByTestId("variation-price").fill("175");
    await admin.page.getByRole("button", { name: /add product/i }).click();

    await expect(admin.page).toHaveURL(/\/admin\/products$/);
    const { results } = await (
      await admin.req.get(`/api/products/?search=${encodeURIComponent(name)}&page_size=5`)
    ).json();
    expect(
      (results as { name: string }[]).some((p) => p.name === name),
      "the product was created",
    ).toBe(true);

    await admin.context.close();
  });
});
