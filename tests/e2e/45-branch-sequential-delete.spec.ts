import { test, expect, type APIRequestContext } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * REGRESSION — sequential branch delete/archive on the Super Admin list.
 *
 * The reported bug: after the FIRST successful delete/archive, every later
 * Delete on the same page stopped working until the browser was refreshed.
 *
 * Cause: `deleteBranchAction` ended with `redirect()`. Next settles a
 * redirecting Server Action's client promise by REJECTING it (it has no action
 * result to resolve with), so `ConfirmModal`'s `setOpen(false)` — which sits
 * after `await action(...)` — never ran. The dialog's `fixed inset-0 z-50`
 * overlay therefore stayed mounted over the whole page and swallowed every
 * subsequent click, and because its own dismiss handler is gated on `!pending`
 * (a transition that never settled) it could not even be clicked away.
 *
 * These specs drive the exact sequence through the browser with NO reload.
 */

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** An unused branch — no products/orders/areas, so it is safe to hard delete. */
async function createBareBranch(req: APIRequestContext, prefix = "SeqBranch") {
  const res = await req.post(`${API_BASE}/api/branches/`, {
    multipart: {
      name: uniq(prefix),
      address: "Nowhere Rd, Dhaka",
      phone: `014${Math.floor(10000000 + Math.random() * 89999999)}`,
      brand_type: "cheez",
    },
  });
  expect(res.status(), "branch created").toBe(201);
  return res.json() as Promise<{ id: number; name: string }>;
}

/** A branch carrying history — the server must ARCHIVE it, not delete it. */
async function createBranchWithHistory(req: APIRequestContext) {
  const branch = await createBareBranch(req, "SeqArchiveBranch");
  // A delivery area is enough history to force the archive path.
  const area = await req.post(`${API_BASE}/api/delivery-areas/`, {
    data: {
      branch_id: branch.id,
      name: uniq("Area"),
      estimated_delivery_minutes: 30,
      delivery_charge: 20,
    },
  });
  expect(area.status(), "dependency created").toBe(201);
  return branch;
}

test.describe("branch delete/archive works repeatedly without a refresh", () => {
  test("archive one branch, then delete two more — all from the same page load", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;

    // One branch that MUST archive (it has a dependency) and two that must be
    // hard-deleted — this is the mix the report described.
    const willArchive = await createBranchWithHistory(admin.req);
    const willDelete1 = await createBareBranch(admin.req);
    const willDelete2 = await createBareBranch(admin.req);

    await page.goto("/admin/branches");
    await expect(page.getByTestId(`branch-row-delete-${willArchive.id}`)).toBeVisible();

    async function deleteRow(id: number, expected: "archived" | "deleted") {
      await page.getByTestId(`branch-row-delete-${id}`).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog, "dialog opens for this row").toBeVisible();
      await dialog.getByRole("button", { name: /delete/i }).click();
      // The dialog must disappear on its own — this is exactly what used to
      // fail, leaving an invisible overlay across the page.
      await expect(dialog, "dialog closes after the action").toBeHidden({ timeout: 20_000 });
      await expect(page, "URL states the REAL outcome").toHaveURL(
        new RegExp(`result=${expected}`),
      );
    }

    // 1st — archives. This is the operation after which everything used to break.
    await deleteRow(willArchive.id, "archived");
    // The archived branch is still listed (history preserved) and now labelled.
    await expect(page.getByText(willArchive.name)).toBeVisible();

    // 2nd — with NO page reload in between.
    await deleteRow(willDelete1.id, "deleted");
    // 3rd — still no reload.
    await deleteRow(willDelete2.id, "deleted");

    // The two unused branches are gone; the archived one is preserved.
    expect((await admin.req.get(`${API_BASE}/api/branches/${willDelete1.id}/`)).status()).toBe(404);
    expect((await admin.req.get(`${API_BASE}/api/branches/${willDelete2.id}/`)).status()).toBe(404);
    const archived = await (await admin.req.get(`${API_BASE}/api/branches/${willArchive.id}/`)).json();
    expect(archived.is_archived, "history-carrying branch was archived, not deleted").toBe(true);
    expect(archived.is_active, "an archived branch takes no new orders").toBe(false);

    await admin.context.close();
  });

  test("cancelling one dialog leaves every other row's Delete working", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    const first = await createBareBranch(admin.req);
    const second = await createBareBranch(admin.req);

    await page.goto("/admin/branches");

    // Open the first row's dialog and cancel it.
    await page.getByTestId(`branch-row-delete-${first.id}`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog, "cancel removes the overlay").toBeHidden();

    // A different row must now be usable immediately.
    await page.getByTestId(`branch-row-delete-${second.id}`).click();
    const secondDialog = page.getByRole("dialog");
    await expect(secondDialog, "the second row's dialog opens").toBeVisible();
    await expect(secondDialog, "and names the SECOND branch").toContainText(second.name);
    await expect(secondDialog, "not the first").not.toContainText(first.name);

    // Escape closes it too, without leaving the page pointer-locked.
    await page.keyboard.press("Escape");
    await expect(secondDialog).toBeHidden();

    // Prove the page still receives clicks: delete the first branch for real.
    await page.getByTestId(`branch-row-delete-${first.id}`).click();
    const third = page.getByRole("dialog");
    await expect(third).toBeVisible();
    await third.getByRole("button", { name: /delete/i }).click();
    await expect(third).toBeHidden({ timeout: 20_000 });
    expect((await admin.req.get(`${API_BASE}/api/branches/${first.id}/`)).status()).toBe(404);

    await admin.context.close();
  });
});
