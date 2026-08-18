import { test, expect } from "@playwright/test";
import { login, setLocale, ROLE_PAGES, trackConsoleErrors, realErrors, expectHealthy } from "./helpers";

for (const [role, paths] of Object.entries(ROLE_PAGES)) {
  test(`${role}: pages stable (no crash / console errors / raw keys / backend text)`, async ({ page, context }) => {
    await setLocale(context, "en");
    const errors = trackConsoleErrors(page);
    await login(page, role);
    for (const path of paths) {
      const res = await page.goto(path);
      expect(res!.status(), `${path} http`).toBeLessThan(400);
      await expect(page.locator("h1"), `${path} heading`).toBeVisible();
      await expectHealthy(page);
    }
    const real = realErrors(errors);
    expect(real, `console errors for ${role}: ${real.join(" | ")}`).toEqual([]);
  });
}

test("no broken images on a media-bearing page", async ({ page, context }) => {
  await setLocale(context, "en");
  await login(page, "customer");
  await page.goto("/customer/dashboard");
  // wait for layout images (brand logo etc.) to settle
  await page.waitForLoadState("networkidle");
  const imgs = page.locator("img");
  const n = await imgs.count();
  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    if (!(await img.isVisible())) continue; // skip off-screen/lazy images
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 5_000 })
      .toBeGreaterThan(0);
  }
});
