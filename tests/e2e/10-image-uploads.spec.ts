import { test, expect } from "@playwright/test";
import { newSession, API_BASE } from "./helpers";

// A small but VALID 8x8 PNG (red) — sharp fully decodes it and re-encodes to
// WebP (verified through the exact saveUpload pipeline).
const PNG_2x2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQYlWO4o6HxHx9mGBkKAIMRisEkggeDAAAAAElFTkSuQmCC",
  "base64",
);

test("profile image upload is converted to WebP, stored as .webp, and served as image/webp", async ({ browser }) => {
  const customer = await newSession(browser, "qa_upload_1");
  try {
    // Upload a PNG to the profile endpoint (multipart, field: profile_photo).
    const res = await customer.req.patch(`${API_BASE}/api/auth/profile`, {
      multipart: {
        first_name: "QA",
        last_name: "Upload",
        email: "qa_upload_1@example.com",
        profile_photo: { name: "avatar.png", mimeType: "image/png", buffer: PNG_2x2 },
      },
    });
    expect(res.status(), "profile update accepted").toBe(200);

    // The stored key must be .webp — never the uploaded .png.
    const me = await (await customer.req.get(`${API_BASE}/api/auth/me`)).json();
    const key: string = me.profile_photo;
    expect(key, "profile_photo persisted").toBeTruthy();
    expect(key.endsWith(".webp"), `stored key is webp: ${key}`).toBe(true);
    expect(/\.(png|jpe?g|avif|bmp|tiff?)$/i.test(key), `no raster original stored: ${key}`).toBe(false);

    // The file is served by /api/uploads with a real image/webp content-type.
    const served = await customer.req.get(`${API_BASE}/api/uploads/${key.replace(/^\/?(api\/uploads\/|uploads\/)/, "")}`);
    expect(served.status(), "uploaded file served").toBe(200);
    expect(served.headers()["content-type"]).toBe("image/webp");
    expect((await served.body()).length, "served bytes non-empty").toBeGreaterThan(0);
  } finally {
    await customer.context.close();
  }
});

test("uploaded avatar displays on the profile page and survives a reload (no broken image)", async ({ browser }) => {
  const customer = await newSession(browser, "qa_upload_2");
  try {
    await customer.req.patch(`${API_BASE}/api/auth/profile`, {
      multipart: {
        first_name: "QA",
        last_name: "Upload",
        email: "qa_upload_2@example.com",
        profile_photo: { name: "avatar.png", mimeType: "image/png", buffer: PNG_2x2 },
      },
    });

    await customer.page.goto("/profile");
    await customer.page.reload();

    // An avatar <img> pointing at a served .webp upload must render (decoded).
    const avatar = customer.page.locator('img[src*="/api/uploads/"][src*=".webp"]').first();
    await expect(avatar).toBeVisible();
    await expect
      .poll(async () => avatar.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 5_000 })
      .toBeGreaterThan(0);
  } finally {
    await customer.context.close();
  }
});
