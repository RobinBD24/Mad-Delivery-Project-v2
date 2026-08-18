import { expect, type Page } from "@playwright/test";

/** Namespaces that would appear only if a raw i18n key leaked into the DOM. */
const KEY_NAMESPACES =
  "nav|notifications|complaints|wallet|rewards|reviews|accounts|marketing|mgmtReports|adminExtras|bmExtras|riderLoc|financials|adminReports|settings|addresses|orders|customer|branchManager|rider|superAdmin|management";

/** Hard-fail if a raw i18n key (e.g. "nav.dashboard") is visible in the page text. */
export async function expectNoRawKeys(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  const m = body.match(new RegExp(`\\b(${KEY_NAMESPACES})\\.[a-zA-Z][a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)*\\b`));
  expect(m ? m[0] : null, `raw i18n key visible: ${m?.[0]}`).toBeNull();
}

/** Hard-fail if any old backend/Django wording is visible. */
export async function expectNoBackendText(page: Page): Promise<void> {
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body, "backend-server wording leaked").not.toContain("backend server");
  expect(body, "django wording leaked").not.toContain("django");
}

/** Hard-fail if the error boundary ("Something went wrong") is showing. */
export async function expectNoErrorBoundary(page: Page): Promise<void> {
  await expect(
    page.getByText(/something went wrong|কিছু একটা ভুল হয়েছে/i),
    "error boundary is visible",
  ).toHaveCount(0);
}

/** Combined health check for a rendered page. */
export async function expectHealthy(page: Page): Promise<void> {
  await expectNoErrorBoundary(page);
  await expectNoBackendText(page);
  await expectNoRawKeys(page);
}

/** Collect real console/page errors (benign noise filtered out). */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

export function realErrors(errors: string[]): string[] {
  return errors.filter(
    (e) => !/favicon|net::ERR_ABORTED|Failed to load resource.*40[13]|ResizeObserver loop/i.test(e),
  );
}
