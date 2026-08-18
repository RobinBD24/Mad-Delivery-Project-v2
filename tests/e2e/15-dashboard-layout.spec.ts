import { test, expect, type Page } from "@playwright/test";
import { login, setLocale, DEMO_USERS, ROLE_DASHBOARD } from "./helpers";

/**
 * The shared authenticated shell (static_design/Branch-manager_dashboard.html
 * ported in components/layout/dashboard-shell.tsx): every role, and every
 * authenticated page, gets the same sidebar + topbar + content container.
 */

/**
 * The standardized brand block (components/layout/dashboard-brand.tsx, ported
 * from the mockup's .brand-row): orange mark + "MAD DELIVERY" + "PLATFORM",
 * identical for every role. Pure SVG + text — any <img> inside it is a
 * regression to the old raster-logo variants.
 */
async function expectBrandBlock(page: Page) {
  const brand = page.getByTestId("dashboard-brand");
  await expect(brand).toBeVisible();
  await expect(brand).toContainText("MAD DELIVERY");
  await expect(brand).toContainText("PLATFORM");
  await expect(brand.locator("img")).toHaveCount(0);
  await expect(brand.locator("svg")).toBeAttached();
}

/** Nav prefixes that belong to exactly one role — used to prove nav isolation. */
const ROLE_NAV_PREFIX: Record<string, string> = {
  super_admin: "/admin",
  management: "/management",
  marketing: "/marketing",
  branch_manager: "/branch-manager",
  accounts: "/accounts",
  rider: "/rider",
  customer: "/customer",
};

async function expectSharedLayout(page: Page) {
  await expect(page.getByTestId("dashboard-sidebar")).toBeVisible();
  await expect(page.getByTestId("dashboard-topbar")).toBeVisible();
  await expect(page.getByTestId("sidebar-nav")).toBeVisible();
  await expectBrandBlock(page);
  // Topbar must carry the full chrome set.
  await expect(page.getByTestId("notification-bell")).toBeVisible();
  await expect(page.getByTestId("theme-switcher")).toBeVisible();
  await expect(page.locator("header").getByRole("group", { name: "Language" })).toBeVisible();
}

test.describe("Shared dashboard layout — every role", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  for (const role of DEMO_USERS) {
    test(`${role} dashboard renders the shared layout with its own nav`, async ({ page }) => {
      await login(page, role);
      // PHASE O — a customer LANDS in the ordering flow, so this spec (which is
      // about the dashboard) navigates there explicitly rather than assuming
      // the landing page and the dashboard are the same screen.
      await page.goto(ROLE_DASHBOARD[role]);
      await expect(page).toHaveURL(new RegExp(`${ROLE_DASHBOARD[role]}$`));
      await expectSharedLayout(page);

      const nav = page.getByTestId("sidebar-nav");
      // Own nav is present…
      await expect(nav.locator(`a[href^="${ROLE_NAV_PREFIX[role]}/"]`).first()).toBeVisible();

      // …and no other role's section is linked.
      for (const [other, prefix] of Object.entries(ROLE_NAV_PREFIX)) {
        if (other === role) continue;
        // /admin is a prefix of nothing else; guard the rider/branch-manager pair.
        await expect(nav.locator(`a[href^="${prefix}/"]`)).toHaveCount(0);
      }

      // Demo content pattern: compact stat strip on every role. The rider
      // dashboard follows its own source (static_design/Rider-Dashbord-offline.html)
      // whose metric row IS the chip strip — no separate KPI cards there.
      await expect(page.locator(".chip-accent").first()).toBeVisible();
      expect(await page.locator(".chip-accent").count()).toBeGreaterThanOrEqual(4);
      if (role !== "rider") {
        expect(await page.locator(".kpi-accent").count()).toBeGreaterThanOrEqual(3);
      }
      // Live status/date bar (.route-bar)
      await expect(page.getByTestId("dashboard-status-bar")).toBeVisible();

      // Mockup's .nav-group-label: sections present, each printed exactly once.
      const headings = await page.getByTestId("nav-group-label").allTextContents();
      expect(headings.length).toBeGreaterThan(0);
      expect(new Set(headings).size).toBe(headings.length);
      // Translated, never raw keys.
      expect(headings.some((h) => h.includes("navGroup."))).toBe(false);
    });
  }
});

test.describe("Shared dashboard layout — shared authenticated pages", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  for (const path of ["/profile", "/change-password"]) {
    test(`${path} uses the same shell`, async ({ page }) => {
      await login(page, "customer");
      await page.goto(path);
      await expectSharedLayout(page);
    });
  }

  test("the user menu is not duplicated in the sidebar", async ({ page }) => {
    await login(page, "customer");
    // The mockup had a profile card in the sidebar foot AND a topbar chip; only
    // the topbar one should exist.
    const sidebar = page.getByTestId("dashboard-sidebar");
    await expect(sidebar.getByRole("link", { name: /my profile/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /logout/i })).toHaveCount(0);

    await page.locator("header").getByRole("button", { name: /customer/i }).first().click();
    await expect(page.getByRole("link", { name: /my profile/i })).toBeVisible();
  });
});

test.describe("Shared dashboard layout — chrome still works", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("notification bell links to the role inbox", async ({ page }) => {
    await login(page, "customer");
    await page.getByTestId("notification-bell").click();
    await page.waitForURL("**/notifications**");
    await expect(page).toHaveURL(/notifications/);
    await expectSharedLayout(page);
  });

  test("language switcher still swaps the locale inside the shell", async ({ page }) => {
    await login(page, "customer");
    await page.locator("header").getByRole("button", { name: "বাংলা" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expectSharedLayout(page);
  });

  test("theme switching still works from the new topbar", async ({ page }) => {
    await login(page, "customer");
    await page.getByTestId("theme-switcher").click();
    await page.getByTestId("theme-switcher-option-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // Sidebar must repaint to the mockup's near-black rail, not stay navy.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector('[data-testid="dashboard-sidebar"]')!;
          return getComputedStyle(el).backgroundColor;
        }),
      )
      .toBe("rgb(12, 14, 19)");
  });

  test("mobile: sidebar is a drawer opened from the topbar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "customer");

    const sidebar = page.getByTestId("dashboard-sidebar");
    // Off-canvas until opened (mockup: translateX(-100%) under 920px).
    await expect(sidebar).not.toBeInViewport();

    await page.getByTestId("sidebar-toggle").click();
    await expect(sidebar).toBeInViewport();

    // Navigating closes it again.
    await sidebar.getByRole("link").nth(1).click();
    await expect(sidebar).not.toBeInViewport();
  });

  test("renders no console errors and no broken images", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await login(page, "super_admin");
    await page.goto("/admin/users");

    const broken = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc || img.src),
    );
    expect(broken).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("Shared dashboard layout — mockup details", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("sidebar carries the hotline pill from the design", async ({ page }) => {
    await login(page, "customer");
    await expect(page.getByTestId("dashboard-sidebar")).toContainText("09638-050505");
  });

  test("branch manager sees the BRANCH block", async ({ page }) => {
    await login(page, "branch_manager");
    await expect(page.getByTestId("topbar-branch")).toBeVisible();
  });

  // Separate test = fresh context: an already-authenticated visit to /login is
  // redirected to the role dashboard, so re-logging in inside one test can't work.
  test("a role without a branch gets no BRANCH block", async ({ page }) => {
    await login(page, "customer");
    await expect(page.getByTestId("dashboard-topbar")).toBeVisible();
    await expect(page.getByTestId("topbar-branch")).toHaveCount(0);
  });
});

test.describe("Redesigned dashboards — content pattern", () => {
  const DASHBOARDS: [string, string][] = [
    ["super_admin", "/admin/dashboard"],
    ["management", "/management/dashboard"],
    ["marketing", "/marketing/dashboard"],
    ["branch_manager", "/branch-manager/dashboard"],
    ["accounts", "/accounts/dashboard"],
    ["rider", "/rider/dashboard"],
    ["customer", "/customer/dashboard"],
  ];

  for (const locale of ["en", "bn"] as const) {
    for (const [role, path] of DASHBOARDS) {
      test(`${role} dashboard (${locale}): no raw keys, no error boundary, no console errors`, async ({
        page,
        context,
      }) => {
        const errors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });

        await setLocale(context, locale);
        await login(page, role);
        await page.goto(path); // the dashboard is not always the landing page
        await expect(page).toHaveURL(new RegExp(`${path}$`));

        // The error boundary renders a retry button; it must not be here.
        await expect(page.getByRole("button", { name: /try again|আবার চেষ্টা/i })).toHaveCount(0);

        // Demo pattern present.
        await expect(page.getByTestId("dashboard-status-bar")).toBeVisible();
        await expect(page.locator(".chip-accent").first()).toBeVisible();

        // No untranslated dotted keys leaked into the page.
        const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        for (const ns of ["superAdmin.", "management.", "marketing.", "accounts.", "rider.", "customer.", "branchManager.", "navGroup.", "dashboard.", "common."]) {
          expect(body, `raw key ${ns} leaked`).not.toContain(ns);
        }

        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe("Redesigned dashboards — responsive", () => {
  const DASHBOARDS: [string, string][] = [
    ["super_admin", "/admin/dashboard"],
    ["management", "/management/dashboard"],
    ["marketing", "/marketing/dashboard"],
    ["branch_manager", "/branch-manager/dashboard"],
    ["accounts", "/accounts/dashboard"],
    ["rider", "/rider/dashboard"],
    ["customer", "/customer/dashboard"],
  ];

  for (const [role, path] of DASHBOARDS) {
    test(`${role} dashboard does not scroll sideways on mobile`, async ({ page, context }) => {
      await setLocale(context, "en");
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, role);
      await page.goto(path); // the dashboard is not always the landing page
      await expect(page).toHaveURL(new RegExp(`${path}$`));

      // A wide table must scroll inside its own container, never the page.
      const scrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(scrolls, `${path} overflows horizontally at 390px`).toBe(false);
    });
  }
});

test.describe("Sidebar brand block — standardized MAD DELIVERY PLATFORM", () => {
  test.beforeEach(async ({ context }) => setLocale(context, "en"));

  test("mobile drawer shows the full brand block; closed drawer hides it", async ({ page }) => {
    await login(page, "branch_manager");
    await page.setViewportSize({ width: 390, height: 844 });

    // Off-canvas (collapsed) state: the rail is translated away, brand hidden.
    await expect(page.getByTestId("dashboard-brand")).not.toBeInViewport();

    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("dashboard-sidebar")).toBeInViewport();
    await expectBrandBlock(page);
    // The block must sit fully inside the drawer, not overflow it. Both rects
    // are read in one frame and polled, so the slide-in transition can't put
    // the two measurements on different frames.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const brand = document
            .querySelector('[data-testid="dashboard-brand"]')!
            .getBoundingClientRect();
          const sidebar = document
            .querySelector('[data-testid="dashboard-sidebar"]')!
            .getBoundingClientRect();
          return brand.left >= sidebar.left - 0.5 && brand.right <= sidebar.right + 1;
        }),
      )
      .toBe(true);
  });

  test("theme switching keeps the brand block intact", async ({ page }) => {
    await login(page, "super_admin");
    await expectBrandBlock(page);

    for (const theme of ["light", "dark"] as const) {
      await page.getByTestId("theme-switcher").click();
      await page.getByTestId(`theme-switcher-option-${theme}`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectBrandBlock(page);
      // The mark keeps the fixed red brand gradient in both themes.
      const bg = await page
        .getByTestId("dashboard-brand")
        .locator("span[aria-hidden]")
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(bg).toContain("linear-gradient");
      expect(bg).toContain("241, 101, 113"); // #f16571 (brand-400)
    }
  });

  test("Bangla locale does not translate the brand name", async ({ page }) => {
    await login(page, "customer");
    await page.locator("header").getByRole("button", { name: "বাংলা" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expectBrandBlock(page);
  });

  test("no console errors while rendering the brand across role homes", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await login(page, "super_admin");
    await expectBrandBlock(page);
    await page.goto("/profile");
    await expectBrandBlock(page);
    expect(errors).toEqual([]);
  });
});
