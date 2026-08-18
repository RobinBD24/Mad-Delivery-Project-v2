import { test, expect } from "@playwright/test";
import { login, setLocale, expectNoRawKeys } from "./helpers";

test("English mode shows English UI", async ({ browser }) => {
  const context = await browser.newContext();
  await setLocale(context, "en");
  const page = await context.newPage();
  await login(page, "customer");
  await page.goto("/customer/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.locator("aside, nav").first()).toContainText("Dashboard");
  await expectNoRawKeys(page);
  await context.close();
});

test("Bangla mode shows Bangla UI", async ({ browser }) => {
  const context = await browser.newContext();
  await setLocale(context, "bn");
  const page = await context.newPage();
  await login(page, "customer");
  await page.goto("/customer/notifications");
  await expect(page.getByRole("heading", { name: "নোটিফিকেশন" })).toBeVisible();
  await expect(page.locator("aside, nav").first()).toContainText("ড্যাশবোর্ড");
  await expectNoRawKeys(page);
  await context.close();
});

test("language persists after refresh", async ({ browser }) => {
  const context = await browser.newContext();
  await setLocale(context, "bn");
  const page = await context.newPage();
  await login(page, "rider");
  await page.goto("/rider/wallet");
  await page.reload();
  await expect(page.locator("aside, nav").first()).toContainText("ড্যাশবোর্ড");
  await context.close();
});

test("system notifications translate: EN=English, BN=Bangla, no raw keys", async ({ browser }) => {
  // The seed gives the rider a key-based commission notification.
  const en = await browser.newContext();
  await setLocale(en, "en");
  const enPage = await en.newPage();
  await login(enPage, "rider");
  await enPage.goto("/rider/notifications");
  await expect(enPage.locator("ul li").first()).toBeVisible();
  const enBody = await enPage.locator("body").innerText();

  const bn = await browser.newContext();
  await setLocale(bn, "bn");
  const bnPage = await bn.newPage();
  await login(bnPage, "rider");
  await bnPage.goto("/rider/notifications");
  await expect(bnPage.locator("ul li").first()).toBeVisible();
  const bnBody = await bnPage.locator("body").innerText();

  // no raw notification keys leaked in either locale
  expect(enBody).not.toMatch(/notifications\.[a-z]+\.[a-z]+/);
  expect(bnBody).not.toMatch(/notifications\.[a-z]+\.[a-z]+/);
  // the keyed commission notification renders in the selected language
  expect(enBody, "EN commission notification").toContain("Commission added");
  expect(bnBody, "BN commission notification").toContain("কমিশন যোগ হয়েছে");
  // and the English one is NOT present in the Bangla view (no mixed system text)
  expect(bnBody).not.toContain("Commission added");

  await en.close();
  await bn.close();
});
