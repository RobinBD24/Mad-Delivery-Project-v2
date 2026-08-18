import { test, expect, request as pwRequest } from "@playwright/test";
import { login, setLocale, ROLE_HOME, WRONG_ROLE_PAGES, WRONG_ROLE_APIS, API_BASE, atPath } from "./helpers";

test.describe("Permissions — wrong-role pages redirect to own dashboard", () => {
  for (const [role, path] of WRONG_ROLE_PAGES) {
    test(`${role} → ${path} is blocked`, async ({ page, context }) => {
      await setLocale(context, "en");
      await login(page, role);
      await page.goto(path);
      // never lands on the forbidden page…
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      // …ends up on its own dashboard
      await expect(page).toHaveURL(atPath(ROLE_HOME[role]));
    });
  }
});

test.describe("Permissions — wrong-role API returns 403", () => {
  for (const [role, api] of WRONG_ROLE_APIS) {
    test(`${role} → ${api} = 403`, async ({ page, context }) => {
      await setLocale(context, "en");
      await login(page, role);
      const res = await page.request.get(API_BASE + api);
      expect(res.status()).toBe(403);
      // clean JSON error, not an HTML stack trace
      const body = await res.text();
      expect(body.trim().startsWith("{")).toBeTruthy();
    });
  }
});

test.describe("Permissions — unauthenticated", () => {
  test("protected page redirects to /login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForURL("**/login**", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected API returns 401", async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(API_BASE + "/api/orders");
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
