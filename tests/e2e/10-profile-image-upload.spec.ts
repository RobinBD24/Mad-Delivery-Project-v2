import path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { login, setLocale } from "./helpers";

// A real, decodable PNG fixture (sharp re-encodes it to WebP on upload).
const FIXTURE = path.join(__dirname, "fixtures", "avatar.png");

/**
 * Production-mode profile image upload regression.
 *
 * Guards the fix for the "broken avatar after upload in `next start`" bug:
 * uploads are stored in the runtime UPLOAD_DIR (not public/) and served by the
 * /api/uploads route handler, so they load in production and survive a restart.
 *
 * The suite runs against a real production build (`next start`, see
 * playwright.config.ts), which is exactly the mode that used to fail.
 */

async function uploadAvatar(page: Page): Promise<void> {
  await page.goto("/profile");
  // Ensure required text fields are non-empty (some seed users have a blank
  // last name) so client validation lets the form submit.
  await page.fill('input[name="first_name"]', "QA");
  await page.fill('input[name="last_name"]', "Tester");
  await page.setInputFiles('input[name="profile_photo"]', FIXTURE);
  await page.getByRole("button", { name: /update profile/i }).click();
  // Server action completed successfully.
  await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 20_000 });
}

/** Assert the avatar is served from /api/uploads, decodes, and returns 200 WebP. */
async function assertAvatarServed(page: Page): Promise<void> {
  const img = page.locator('img[src*="/api/uploads/"]').first();
  await expect(img).toBeVisible({ timeout: 10_000 });
  // Actually decoded — not the broken-image glyph.
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);
  // The route handler returns the file (200) as WebP.
  const src = await img.getAttribute("src");
  expect(src).toBeTruthy();
  const res = await page.request.get(src as string);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/webp");
}

// Dedicated fixture users (seeded) — never the shared demo accounts — so this
// spec mutates only its own users and stays independent of execution order.
for (const fixture of ["qa_upload_1", "qa_upload_2"]) {
  test(`profile image upload works in production start mode (${fixture})`, async ({ page }) => {
    await setLocale(page.context(), "en"); // deterministic English success text
    await login(page, fixture);

    await uploadAvatar(page);
    // Immediately after upload the avatar shows (blob preview or served file).
    await expect(page.locator("form img, header img").first()).toBeVisible();

    // After a full reload the URL points at /api/uploads and the file loads —
    // i.e. it is NOT a build-time public/ asset and survives beyond the request.
    await page.reload();
    await assertAvatarServed(page);

    // Topbar avatar (shared UserAvatar) uses the same served URL.
    const topbar = page.locator('header img[src*="/api/uploads/"]');
    await expect(topbar.first()).toBeVisible({ timeout: 10_000 });
  });
}
