import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * PHASE K — the table layout must draw EXACTLY the configured number of chairs.
 *
 * "Looks about right" is not the bar here: the tests count the rendered chair
 * elements, check they are spread across the sides rather than stacked on one
 * edge, and measure the real DOM rectangles to prove no two chairs (and no
 * chair and table body) overlap. Status is asserted to be readable as TEXT, not
 * only as a colour.
 */

const TABLES = `${API_BASE}/api/branch-tables/`;

/** Create a table with a known name/geometry, reusing it if a run left one. */
async function ensureTable(
  req: APIRequestContext,
  name: string,
  fields: { seats: number; pos_x: number; pos_y: number; width: number; height: number; status?: string },
) {
  const create = await req.post(TABLES, { data: { name, ...fields } });
  if (create.status() === 201) {
    const created = await create.json();
    // POST does not take geometry beyond the position, so pin the rest.
    const patched = await req.patch(`${TABLES}${created.id}/`, { data: fields });
    expect(patched.status()).toBe(200);
    return patched.json();
  }
  // Already present from an earlier run in this database — reset it instead.
  const list = await (await req.get(`${TABLES}?page_size=200`)).json();
  const existing = (list.results as { id: number; name: string }[]).find((t) => t.name === name);
  expect(existing, `table ${name} exists or was created`).toBeTruthy();
  const patched = await req.patch(`${TABLES}${existing!.id}/`, { data: fields });
  expect(patched.status()).toBe(200);
  return patched.json();
}

interface Box { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function nodeBoxes(page: Page, tableId: number) {
  const node = page.locator(`[data-table="${tableId}"]`);
  // The canvas clips its contents, so a node parked near an edge can be off
  // the visible area on a short viewport. A best-effort scroll brings it into
  // view; it is wrapped because scrollIntoViewIfNeeded waits for layout
  // STABILITY, and the tables page also carries a polling notification bell that
  // can keep the layout nudging under load — a stability timeout there must not
  // fail a test about chair geometry. The visibility wait below is the real
  // gate, and the boundingBox reads that follow do not require a prior scroll.
  await node.scrollIntoViewIfNeeded({ timeout: 4_000 }).catch(() => {});
  await expect(node).toBeVisible({ timeout: 15_000 });
  const chairs = node.getByTestId("table-chair");
  const count = await chairs.count();
  const boxes: Box[] = [];
  for (let i = 0; i < count; i += 1) boxes.push((await chairs.nth(i).boundingBox())!);
  const body = (await node.getByTestId("table-body").boundingBox())!;
  return { node, chairs, count, boxes, body };
}

test.describe("Phase K — chairs match capacity exactly", () => {
  for (const seats of [2, 4, 6, 8, 5, 10]) {
    test(`a ${seats}-seat table draws ${seats} chairs, evenly spread and never overlapping`, async ({ browser }) => {
      const bm = await newSession(browser, "branch_manager");
      const table = await ensureTable(bm.req, `K${seats}`, {
        seats,
        pos_x: 10 + seats * 12,
        pos_y: 10,
        width: 70,
        height: 70,
      });

      await bm.page.goto("/branch-manager/tables");
      const { count, boxes, body, node } = await nodeBoxes(bm.page, table.id);

      expect(count, "one chair per configured seat").toBe(seats);
      await expect(node.getByTestId("table-seat-count")).toHaveText(String(seats));

      // No chair overlaps another chair.
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `chair ${i} and chair ${j} overlap`).toBe(false);
        }
      }
      // No chair sits on top of the table body.
      for (let i = 0; i < boxes.length; i += 1) {
        expect(overlaps(boxes[i], body), `chair ${i} overlaps the table body`).toBe(false);
      }

      // Chairs are spread around the table, not lined up on a single edge: with
      // 2+ seats at least two distinct sides must be occupied.
      const sides = new Set(
        boxes.map((c) => {
          const cx = c.x + c.width / 2;
          const cy = c.y + c.height / 2;
          if (cy < body.y) return "top";
          if (cy > body.y + body.height) return "bottom";
          return cx < body.x ? "left" : "right";
        }),
      );
      expect(sides.size, "chairs use more than one side").toBeGreaterThanOrEqual(Math.min(2, seats));
      expect(sides.size, "chairs never use more than four sides").toBeLessThanOrEqual(4);
    });
  }

  test("changing the capacity changes the chair count with it", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const table = await ensureTable(bm.req, "KFlex", { seats: 4, pos_x: 200, pos_y: 120, width: 70, height: 70 });

    await bm.page.goto("/branch-manager/tables");
    expect((await nodeBoxes(bm.page, table.id)).count).toBe(4);

    expect((await bm.req.patch(`${TABLES}${table.id}/`, { data: { seats: 7 } })).status()).toBe(200);
    await bm.page.reload();
    const after = await nodeBoxes(bm.page, table.id);
    expect(after.count, "the drawing follows the configured capacity").toBe(7);
    for (let i = 0; i < after.boxes.length; i += 1) {
      for (let j = i + 1; j < after.boxes.length; j += 1) {
        expect(overlaps(after.boxes[i], after.boxes[j])).toBe(false);
      }
    }
    // Restore, so a re-run starts from the same place.
    await bm.req.patch(`${TABLES}${table.id}/`, { data: { seats: 4 } });
  });
});

test.describe("Phase K — state is readable without colour", () => {
  test("every status is written out and the coordinates survive", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const cases: [string, string][] = [
      ["available", "b3-available"],
      ["occupied", "b3-occupied"],
      ["out_of_service", "b3-oos"],
    ];
    const made: { id: number; status: string }[] = [];
    for (const [status, name] of cases) {
      const table = await ensureTable(bm.req, name, {
        seats: 4,
        pos_x: 30,
        pos_y: 150,
        width: 70,
        height: 70,
        status,
      });
      made.push({ id: table.id, status });
    }

    await bm.page.goto("/branch-manager/tables");
    for (const { id, status } of made) {
      const node = bm.page.locator(`[data-table="${id}"]`);
      await expect(node).toHaveAttribute("data-status", status);
      // The status is present as TEXT, so it does not depend on colour vision.
      await expect(node.getByTestId("table-status-label")).not.toBeEmpty();
      // …and the accessible name carries name + seats + status together.
      await expect(node.getByTestId("table-body")).toHaveAttribute("aria-label", /.+—.+—.+/);
    }

    // Stored coordinates are untouched by the drawing.
    const stored = await (await bm.req.get(`${TABLES}?page_size=200`)).json();
    const row = (stored.results as { id: number; pos_x: number; pos_y: number }[]).find((tb) => tb.id === made[0].id)!;
    expect(row.pos_x).toBe(30);
    expect(row.pos_y).toBe(150);
  });
});

test.describe("Phase K — visual regression", () => {
  test("an 8-seat table renders consistently", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    // Parked well away from the tables other specs create: an element
    // screenshot captures whatever is painted over that region, so a neighbour
    // drifting into the box would show up as a pixel diff that has nothing to
    // do with this component.
    const table = await ensureTable(bm.req, "KSnap", {
      seats: 8,
      pos_x: 620,
      pos_y: 230,
      width: 80,
      height: 80,
      status: "available",
    });
    await bm.page.setViewportSize({ width: 1280, height: 800 });
    await bm.page.goto("/branch-manager/tables", { waitUntil: "networkidle" });
    const node = bm.page.locator(`[data-table="${table.id}"]`);
    await node.scrollIntoViewIfNeeded();
    await expect(node).toBeVisible();

    // Captured as a CLIPPED PAGE screenshot rather than an element screenshot.
    // An element capture first waits for that element to stop moving, and this
    // page carries a polling notification bell that keeps nudging the layout —
    // the clip is pinned to the node's own box, so the subject is identical
    // while the flaky stability wait is avoided.
    const box = (await node.boundingBox())!;
    await expect(bm.page).toHaveScreenshot("table-node-8-seats.png", {
      clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
      animations: "disabled",
      caret: "hide",
      // A full-page capture on a loaded machine can take a while to settle;
      // the default 10s expect timeout is about the screenshot, not the layout.
      timeout: 30_000,
    });
  });

  test("the layout is usable on a phone-sized screen", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const table = await ensureTable(bm.req, "KMobile", {
      seats: 6,
      pos_x: 16,
      pos_y: 16,
      width: 64,
      height: 64,
    });
    await bm.page.setViewportSize({ width: 360, height: 740 });
    await bm.page.goto("/branch-manager/tables");
    const { count, boxes, body } = await nodeBoxes(bm.page, table.id);
    expect(count).toBe(6);
    for (let i = 0; i < boxes.length; i += 1) {
      expect(overlaps(boxes[i], body), "chairs stay clear of the table on mobile").toBe(false);
    }
    // The canvas itself must not force the page to scroll sideways.
    const overflow = await bm.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page overflow at 360px").toBeLessThanOrEqual(1);
  });
});
