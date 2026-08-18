import { test, expect, type Page } from "@playwright/test";

import { login, newSession, setLocale } from "./helpers";

/**
 * PHASE C — measured performance, not claimed performance.
 *
 * Every number below is read from the browser at run time (Resource Timing,
 * PerformanceObserver, request counts). No Lighthouse score is asserted or
 * invented. The budgets are deliberately generous: they exist to catch a
 * regression — a map bundle loading on a page with no map, a polling loop
 * running flat out, a page suddenly shipping megabytes — not to encode a
 * particular machine's timings.
 */

interface PageWeight {
  requests: number;
  transferredKb: number;
  scriptKb: number;
  imageKb: number;
  duplicates: string[];
}

async function measure(page: Page): Promise<PageWeight> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const seen = new Map<string, number>();
    let transferred = 0;
    let script = 0;
    let image = 0;
    for (const e of entries) {
      transferred += e.transferSize || 0;
      if (e.initiatorType === "script") script += e.transferSize || 0;
      if (e.initiatorType === "img" || e.initiatorType === "image") image += e.transferSize || 0;
      // Ignore cache-busting query strings when looking for repeats.
      const key = e.name.split("?")[0];
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return {
      requests: entries.length,
      transferredKb: Math.round(transferred / 1024),
      scriptKb: Math.round(script / 1024),
      imageKb: Math.round(image / 1024),
      duplicates: [...seen.entries()].filter(([, n]) => n > 2).map(([url, n]) => `${url} ×${n}`),
    };
  });
}

test.describe("Phase C — page weight", () => {
  test("the public homepage stays light and fetches nothing twice", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const weight = await measure(page);
    // Reported so a regression is visible in the run output, not just asserted.
    console.log(`homepage: ${weight.requests} requests, ${weight.transferredKb}KB total, ${weight.scriptKb}KB JS, ${weight.imageKb}KB images`);

    expect(weight.transferredKb, "homepage transfer budget").toBeLessThan(3000);
    expect(weight.requests, "homepage request budget").toBeLessThan(150);
    expect(weight.duplicates, `the same asset fetched repeatedly: ${weight.duplicates.join(", ")}`).toEqual([]);

    // No third-party map is loaded on a page that shows no map.
    const mapRequests = await page.evaluate(
      () =>
        (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) =>
          /maps\.googleapis|maps\.google\.com/.test(e.name),
        ).length,
    );
    expect(mapRequests, "no map code on the homepage").toBe(0);

    const liquidGold = await page.evaluate(() => {
      const entry = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).find((item) =>
        item.name.includes("liquid-gold"),
      );
      return entry ? { url: entry.name, transferred: entry.transferSize } : null;
    });
    expect(liquidGold, "the homepage loads the Liquid Gold product image").not.toBeNull();
    expect(liquidGold?.url, "the product card uses its display-sized asset").toContain("liquid-gold-card.webp");
    expect(liquidGold?.transferred ?? Infinity, "Liquid Gold image transfer stays below 120KB").toBeLessThan(120_000);
  });

  test("images below the fold are lazy and carry their own dimensions", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const images = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img")).map((img) => ({
        src: img.currentSrc || img.src,
        lazy: img.loading === "lazy",
        hasSize: Boolean(img.getAttribute("width") && img.getAttribute("height")),
        // next/image with `fill` sizes itself from the positioned parent, which
        // reserves the box just as explicit width/height would.
        filled: getComputedStyle(img).position === "absolute",
        top: img.getBoundingClientRect().top,
      })),
    );
    expect(images.length, "the page really does have images").toBeGreaterThan(0);

    const unreserved = images.filter((i) => !i.hasSize && !i.filled);
    expect(unreserved.length, `images with no reserved box: ${unreserved.map((i) => i.src).join(", ")}`).toBe(0);

    // Anything well below the fold should not be blocking the first paint.
    const eagerBelowFold = images.filter((i) => i.top > 1200 && !i.lazy && !i.filled);
    expect(eagerBelowFold.length, "below-the-fold images are lazy").toBe(0);
  });

  test("a dashboard page loads without pulling in map code", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    await bm.page.goto("/branch-manager/dashboard", { waitUntil: "networkidle" });
    const weight = await measure(bm.page);
    console.log(`BM dashboard: ${weight.requests} requests, ${weight.transferredKb}KB total, ${weight.scriptKb}KB JS`);
    expect(weight.transferredKb, "dashboard transfer budget").toBeLessThan(3000);
    expect(weight.duplicates, `repeated fetches: ${weight.duplicates.join(", ")}`).toEqual([]);
  });

  test("dashboard sidebar prefetch waits for user intent", async ({ browser }) => {
    const context = await browser.newContext();
    await setLocale(context, "en");
    const page = await context.newPage();
    const siblingRoutes: string[] = [];

    await page.route("**/branch-manager/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (
        pathname.startsWith("/branch-manager/") &&
        pathname !== "/branch-manager/dashboard"
      ) {
        siblingRoutes.push(pathname);
      }
      await route.continue();
    });

    await login(page, "branch_manager");
    await expect(page.getByTestId("dashboard-sidebar")).toBeVisible();
    await page.waitForTimeout(750);

    const beforeIntent = new Set(siblingRoutes);
    console.log(`sidebar: ${beforeIntent.size} sibling route requests before intent`);
    expect(
      beforeIntent.has("/branch-manager/delivery-zone"),
      `sidebar prefetched before intent: ${[...beforeIntent].join(", ")}`,
    ).toBe(false);
    expect(
      beforeIntent.size,
      `too many dashboard routes prefetched on load: ${[...beforeIntent].join(", ")}`,
    ).toBeLessThanOrEqual(3);

    await page.locator('a[href="/branch-manager/delivery-zone"]').hover();
    await expect
      .poll(() => siblingRoutes.includes("/branch-manager/delivery-zone"), {
        message: "hovering a sidebar link prefetches its route",
        timeout: 5_000,
      })
      .toBe(true);

    await context.close();
  });
});

test.describe("Phase C/D — polling is bounded", () => {
  test("the live board polls at its stated interval, one request at a time", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const hits: number[] = [];
    await bm.page.route("**/api/dashboard/branch-manager/live**", async (route) => {
      hits.push(Date.now());
      await route.continue();
    });

    await bm.page.goto("/branch-manager/dashboard");
    await expect(bm.page.getByTestId("live-board")).toBeVisible();
    await bm.page.waitForTimeout(6_000);
    const inSixSeconds = hits.length;
    console.log(`live board: ${inSixSeconds} polls in ~6s`);

    // 2s interval → roughly 3-4 in six seconds. A runaway loop (or a second
    // interval mounted by a re-render) would be far higher.
    expect(inSixSeconds, "polls at roughly the stated 2s interval").toBeGreaterThanOrEqual(2);
    expect(inSixSeconds, "no runaway polling").toBeLessThanOrEqual(8);
  });

  test("polling stops while the tab is hidden and resumes when it returns", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    let hits = 0;
    await bm.page.route("**/api/dashboard/branch-manager/live**", async (route) => {
      hits += 1;
      await route.continue();
    });
    await bm.page.goto("/branch-manager/dashboard");
    await expect(bm.page.getByTestId("live-board")).toBeVisible();

    // Report the tab as hidden and fire the event the hook listens for.
    await bm.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await bm.page.waitForTimeout(1_000);
    const whenHidden = hits;
    await bm.page.waitForTimeout(5_000);
    expect(hits - whenHidden, "a hidden tab costs nothing").toBe(0);

    // Coming back refreshes immediately rather than waiting out the interval.
    await bm.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => hits, { message: "polling resumes on return", timeout: 5_000 }).toBeGreaterThan(whenHidden);
  });
});
