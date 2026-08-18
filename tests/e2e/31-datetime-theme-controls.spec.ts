import { test, expect, type Page } from "@playwright/test";

import { newSession, setLocale } from "./helpers";

/**
 * PHASE 8 — date/time must render in Asia/Dhaka, in the APPLICATION locale
 * (English for en, Bangla for bn), switch immediately with the language, and be
 * free of the unwanted moving header icon.
 * PHASE 14 / PHASE 2 — shared form controls (especially native <select> option
 * lists) must be readable in BOTH themes; no control may keep a hand-rolled
 * class that drops the themed background/foreground.
 */

const BN_DIGITS = /[০-৯]/;
const EN_DIGITS = /[0-9]/;

async function statusStamp(page: Page): Promise<string> {
  const bar = page.getByTestId("dashboard-status-bar");
  await expect(bar).toBeVisible();
  // The clock fills in after hydration.
  await expect.poll(async () => (await bar.innerText()).trim().length).toBeGreaterThan(0);
  return (await bar.innerText()).trim();
}

test.describe("Phase 8 — date/time locale + timezone", () => {
  test("English locale renders an English Asia/Dhaka stamp", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin", "en");
    await admin.page.goto("/admin/dashboard");
    const text = await statusStamp(admin.page);
    expect(text, "latin digits in English").toMatch(EN_DIGITS);
    expect(text, "no Bengali digits leak into English").not.toMatch(BN_DIGITS);
    expect(text, "12-hour clock marker").toMatch(/am|pm/i);
  });

  test("Bangla locale renders a Bangla stamp", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin", "bn");
    await admin.page.goto("/admin/dashboard");
    const text = await statusStamp(admin.page);
    expect(text, "Bengali digits in Bangla").toMatch(BN_DIGITS);
  });

  test("switching language switches the rendered date/time", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin", "en");
    await admin.page.goto("/admin/dashboard");
    const english = await statusStamp(admin.page);
    expect(english).not.toMatch(BN_DIGITS);

    await setLocale(admin.context, "bn");
    await admin.page.goto("/admin/dashboard");
    const bangla = await statusStamp(admin.page);
    expect(bangla, "Bangla after switching").toMatch(BN_DIGITS);
    expect(bangla).not.toBe(english);
  });

  test("the timezone is stable (Asia/Dhaka) regardless of the browser timezone", async ({ browser }) => {
    // A browser pinned to a very different zone must still show Dhaka time.
    const context = await browser.newContext({ timezoneId: "America/New_York" });
    await setLocale(context, "en");
    const page = await context.newPage();
    const { login } = await import("./helpers/auth");
    await login(page, "super_admin");
    await page.goto("/admin/dashboard");
    const shown = await statusStamp(page);

    const dhakaHour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" })
        .format(new Date()),
    );
    const match = /(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)/i.exec(shown);
    expect(match, `a 12-hour time is rendered: ${shown}`).not.toBeNull();
    let hour = Number(match![1]) % 12;
    if (/pm/i.test(match![4])) hour += 12;
    // Allow an hour of slack for a minute-boundary crossing during the run.
    expect(Math.abs(hour - dhakaHour) % 24, "clock follows Asia/Dhaka, not the browser zone")
      .toBeLessThanOrEqual(1);
    await context.close();
  });

  test("the unwanted moving header icon is gone", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/dashboard");
    await expect(admin.page.getByTestId("dashboard-status-bar")).toBeVisible();
    // The gliding rider element and its animation must not exist anywhere.
    expect(await admin.page.locator(".route-rider").count(), "no gliding rider element").toBe(0);
    const animated = await admin.page.evaluate(() => {
      const bar = document.querySelector('[data-testid="dashboard-status-bar"]');
      if (!bar) return [];
      return [...bar.querySelectorAll("*")]
        .filter((el) => {
          const a = getComputedStyle(el).animationName;
          return a && a !== "none" && !a.includes("ping"); // the live dot may pulse
        })
        .map((el) => getComputedStyle(el).animationName);
    });
    expect(animated, "no travelling animation in the status bar").toEqual([]);
  });
});

test.describe("Phase 14/2 — themed form controls in light and dark", () => {
  const THEMES = ["light", "dark"] as const;

  for (const theme of THEMES) {
    test(`notice Audience dropdown is readable in ${theme} mode`, async ({ browser }) => {
      const admin = await newSession(browser, "super_admin");
      await admin.context.addCookies([
        { name: "mad_theme", value: theme, url: new URL(admin.page.url() || "http://localhost").origin },
      ]);
      await admin.page.goto("/admin/notices");

      const select = admin.page.locator('select[name="audience"]');
      await expect(select).toBeVisible();

      const cls = (await select.getAttribute("class")) ?? "";
      // It must be the SHARED themed control, not a hand-rolled class.
      expect(cls, "themed surface").toContain("bg-surface-card");
      expect(cls, "themed text").toContain("text-fg-base");
      expect(cls, "native option colours forced for dark mode").toContain("[&>option]:bg-surface-card");

      // Foreground and background must not collapse to the same colour.
      const { color, background } = await select.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor };
      });
      expect(color, `${theme}: text colour resolves`).not.toBe("");
      expect(color, `${theme}: text is not identical to its background`).not.toBe(background);
    });
  }

  test("no form control keeps a theme-unsafe hand-rolled class", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // Pages that previously hand-rolled a `field` class.
    for (const path of ["/admin/notices", "/admin/categories"]) {
      await admin.page.goto(path);
      const bad = await admin.page.evaluate(() => {
        const offenders: string[] = [];
        for (const el of document.querySelectorAll("input, select, textarea")) {
          if ((el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio") continue;
          if ((el as HTMLInputElement).type === "hidden") continue;
          const s = getComputedStyle(el);
          // A control whose background is fully transparent inherits whatever is
          // behind it — the root cause of unreadable dark-mode fields.
          if (s.backgroundColor === "rgba(0, 0, 0, 0)" || s.backgroundColor === "transparent") {
            offenders.push(`${el.tagName.toLowerCase()}[name=${(el as HTMLInputElement).name || "?"}]`);
          }
        }
        return offenders;
      });
      expect(bad, `${path}: every control has an explicit themed background`).toEqual([]);
    }
  });
});
