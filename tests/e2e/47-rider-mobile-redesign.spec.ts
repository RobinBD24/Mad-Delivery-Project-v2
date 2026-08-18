import { expect, test } from "@playwright/test";

import { login, setLocale } from "./helpers";

test.describe("Rider mobile-first dashboard", () => {
  test("critical duty and current-delivery panels precede secondary chat", async ({ page, context }) => {
    await setLocale(context, "en");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "rider");
    await page.goto("/rider/dashboard");

    const duty = page.getByTestId("rider-online-panel");
    const current = page.getByTestId("rider-current-order");
    const chat = page.getByTestId("rider-duty-chat-section");

    await expect(duty).toBeVisible();
    await expect(current).toBeVisible();
    await expect(chat).toBeVisible();

    const dutyBox = await duty.boundingBox();
    const currentBox = await current.boundingBox();
    const chatBox = await chat.boundingBox();
    expect(dutyBox?.y ?? Infinity).toBeLessThan(currentBox?.y ?? -Infinity);
    expect(currentBox?.y ?? Infinity).toBeLessThan(chatBox?.y ?? -Infinity);

    const mainAction = page.getByTestId("rider-go-online");
    const actionBox = await mainAction.boundingBox();
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(48);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("order history shows ledger earnings rather than a delivery estimate", async ({ page, context }) => {
    await setLocale(context, "en");
    await login(page, "rider");
    const walletResponse = await page.request.get("/api/rider/wallet");
    expect(walletResponse.ok()).toBeTruthy();
    const wallet = (await walletResponse.json()) as { total_earnings: string | number };
    const expected = `৳${Number(wallet.total_earnings).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    await page.goto("/rider/order-history");
    const earnings = page.getByTestId("summary-card").filter({ hasText: "Total Earnings" });
    await expect(earnings).toContainText(expected);
    await expect(page.getByText(/estimated|est\./i)).toHaveCount(0);
  });
});
