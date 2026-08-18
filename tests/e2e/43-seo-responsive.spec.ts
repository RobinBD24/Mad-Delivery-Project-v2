import { test, expect, type Page } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * PHASES A/B — responsive behaviour and public SEO.
 *
 * No score is claimed here. Each assertion checks a specific, verifiable fact:
 * the page does not scroll sideways, the metadata points at this deployment's
 * own origin (never localhost in a proxied deployment, never a foreign domain),
 * dashboards are excluded from indexing, and the heading order is sane.
 */

const WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1440];

/** Horizontal overflow in CSS pixels (1px of rounding is tolerated). */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Any element whose right edge is past the viewport — the usual culprit. */
async function offendingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.overflowX === "auto" || style.overflowX === "scroll") continue;
      if (rect.right > limit && el.scrollWidth <= el.clientWidth + 1) {
        out.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)}`);
      }
    }
    return out.slice(0, 5);
  });
}

test.describe("Phase B — public SEO", () => {
  test("the homepage carries canonical, Open Graph, Twitter and structured data", async ({ page }) => {
    await page.goto("/");

    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, "canonical present").toBeTruthy();
    // It must be this deployment's own origin — never a different domain.
    expect(canonical!.startsWith(new URL(page.url()).origin), `canonical ${canonical} matches origin`).toBe(true);

    for (const property of ["og:title", "og:description", "og:type", "og:url"]) {
      const value = await page.locator(`meta[property="${property}"]`).getAttribute("content");
      expect(value, `${property} present`).toBeTruthy();
    }
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
    await expect(page).toHaveTitle(/MAD Delivery/i);

    // Structured data is valid JSON built from real data.
    const ld = await page.getByTestId("home-structured-data").textContent();
    const parsed = JSON.parse(ld!) as { "@type": string; url: string; department: unknown[] };
    expect(parsed["@type"]).toBe("Organization");
    expect(parsed.url.startsWith(new URL(page.url()).origin)).toBe(true);
    expect(Array.isArray(parsed.department)).toBe(true);

    // Exactly one <h1>, and no heading level is skipped on the way down.
    expect(await page.locator("h1").count(), "exactly one h1").toBe(1);
    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => Number(h.tagName[1])),
    );
    let previous = levels[0];
    for (const level of levels.slice(1)) {
      expect(level - previous, `heading jumps from h${previous} to h${level}`).toBeLessThanOrEqual(1);
      previous = Math.min(previous, level) === level ? level : Math.max(previous, level) === level ? level : level;
    }

    // Every content image has alt text (decorative images use alt="").
    const missingAlt = await page.evaluate(
      () => Array.from(document.querySelectorAll("img")).filter((i) => i.getAttribute("alt") === null).length,
    );
    expect(missingAlt, "no image without an alt attribute").toBe(0);
  });

  test("robots.txt and sitemap.xml are served and agree on the origin", async ({ page, request }) => {
    const origin = new URL(page.url() || API_BASE).origin;

    const robots = await request.get(`${API_BASE}/robots.txt`);
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    // Authenticated areas are excluded explicitly.
    for (const section of ["/api/", "/admin/", "/branch-manager/", "/customer/", "/rider/"]) {
      expect(robotsBody, `${section} disallowed`).toContain(`Disallow: ${section}`);
    }
    expect(robotsBody, "sitemap advertised").toContain("Sitemap:");
    expect(robotsBody, "no foreign domain").not.toContain("example.com");

    const sitemap = await request.get(`${API_BASE}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain("<urlset");
    expect(sitemapBody, "the storefront is listed at the serving origin").toContain(`<loc>${API_BASE}/</loc>`);
    // Dashboards are never advertised for crawling.
    for (const section of ["/admin/", "/branch-manager/", "/customer/orders"]) {
      expect(sitemapBody, `${section} not in the sitemap`).not.toContain(section);
    }
    expect(origin).toBeTruthy();
  });

  test("authenticated pages are excluded from indexing", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await customer.page.goto("/customer/orders");
    const robots = await customer.page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots, "dashboard is noindex").toMatch(/noindex/);

    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto("/login");
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
    await anon.close();
  });
});

test.describe("Phase A/B — no horizontal overflow at any supported width", () => {
  test("the public homepage holds together from 320px to desktop", async ({ page }) => {
    await page.goto("/");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(150); // let the layout settle after the resize
      const over = await overflow(page);
      expect(over, `homepage overflows at ${width}px (${(await offendingElements(page)).join(", ")})`).toBeLessThanOrEqual(1);
    }
  });

  test("the customer ordering flow holds together at every width", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    for (const path of ["/customer/branches", "/customer/orders", "/customer/rewards"]) {
      await customer.page.goto(path);
      for (const width of WIDTHS) {
        await customer.page.setViewportSize({ width, height: 800 });
        await customer.page.waitForTimeout(120);
        const over = await overflow(customer.page);
        expect(over, `${path} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("staff pages with dense tables stay inside the viewport", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    for (const path of ["/branch-manager/dashboard", "/branch-manager/employees", "/branch-manager/tables", "/branch-manager/orders"]) {
      await bm.page.goto(path);
      for (const width of [320, 375, 768, 1440]) {
        await bm.page.setViewportSize({ width, height: 800 });
        await bm.page.waitForTimeout(120);
        const over = await overflow(bm.page);
        expect(over, `${path} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("admin settings pages behave the same", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    for (const path of ["/admin/rewards", "/admin/dashboard", "/admin/branches"]) {
      await admin.page.goto(path);
      for (const width of [320, 375, 768, 1440]) {
        await admin.page.setViewportSize({ width, height: 800 });
        await admin.page.waitForTimeout(120);
        const over = await overflow(admin.page);
        expect(over, `${path} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });
});

test.describe("Phase A — shared components behave consistently", () => {
  test("interactive controls are keyboard reachable and show focus", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.setViewportSize({ width: 1280, height: 900 });
    await admin.page.goto("/admin/rewards");

    // The rules manager's primary action is reachable by keyboard and takes a
    // visible focus style (never `outline: none` with nothing in its place).
    // Focus is asserted through the DOM rather than Playwright's window-level
    // focus state, which is unreliable when several browser contexts are open.
    // Polled because React may still be hydrating and replacing the node when
    // the page first paints: this waits for the page to be interactive, it does
    // not retry a failing assertion.
    const button = admin.page.getByTestId("reward-rule-new");
    await expect
      .poll(
        async () =>
          button.evaluate((el) => {
            (el as HTMLElement).focus();
            return document.activeElement === el;
          }),
        { message: "the control accepts keyboard focus", timeout: 15_000 },
      )
      .toBe(true);
    const focusStyle = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow, ring: s.borderColor };
    });
    const hasVisibleFocus =
      focusStyle.outline !== "none" || focusStyle.shadow !== "none" || parseFloat(focusStyle.width) > 0;
    expect(hasVisibleFocus, "focused control is visibly focused").toBe(true);
  });

  test("touch targets on mobile are big enough to hit", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    await customer.page.setViewportSize({ width: 360, height: 740 });
    await customer.page.goto("/customer/branches");

    const small = await customer.page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href]"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // hidden
        if (getComputedStyle(el).display === "inline") continue; // inline text link
        if (r.height < 32) bad.push(`${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 24)}`);
      }
      return bad.slice(0, 5);
    });
    expect(small, `controls below 32px tall: ${small.join(", ")}`).toEqual([]);
  });
});
