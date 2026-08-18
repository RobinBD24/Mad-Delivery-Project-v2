import { crc32 } from "node:zlib";

import { test, expect, type APIRequestContext } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * LARGE IMAGE UPLOAD.
 *
 * Creating a product with a photo failed with
 * `413 Body exceeded 1 MB limit` — Next caps Server Action bodies at 1 MB by
 * default, and the product form posts its image through an action. A second,
 * independent 10 MB cap sits in the proxy layer (`proxyClientMaxBodySize`), and
 * the shared validation cap was 5 MB. All three are now 50 MB, and the WebP
 * encoder was hardened so a very large source converts instead of throwing.
 *
 * These tests push payloads past BOTH old ceilings — the 1 MB action limit and
 * the 10 MB proxy limit — through the real upload path, and assert the product is
 * stored with a WebP image. The cap is now 50 MB on all three layers.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/**
 * A valid PNG of an arbitrary byte length, built without an image library so the
 * test has no native dependency: a real 1×1 PNG with a large ancillary `tEXt`
 * chunk spliced in before IEND. Decoders read the pixels and skip the padding,
 * which is exactly what is wanted — a genuinely large FILE that is cheap to
 * decode, so the test measures the size limits rather than encoder throughput.
 */
function makePngOfSize(bytes: number): Buffer {
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const iendAt = base.length - 12; // IEND = 4 len + 4 type + 0 data + 4 crc

  const keyword = Buffer.from("Comment\0", "latin1");
  const padding = Buffer.alloc(Math.max(0, bytes - base.length - 12 - keyword.length), 0x41);
  const data = Buffer.concat([keyword, padding]);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const type = Buffer.from("tEXt", "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 0);

  return Buffer.concat([
    base.subarray(0, iendAt),
    length,
    type,
    data,
    crc,
    base.subarray(iendAt),
  ]);
}

async function firstBranch(req: APIRequestContext) {
  const { results } = await (await req.get("/api/branches/?page_size=1")).json();
  return results[0] as { id: number; name: string };
}

async function makeCategory(req: APIRequestContext, branchId: number) {
  const res = await req.post("/api/categories/", {
    data: { name: uniq("ImgCat"), branch_id: branchId, is_active: true },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number };
}

test("the generated fixture really is a large, valid PNG", () => {
  const png = makePngOfSize(2 * 1024 * 1024);
  expect(png.length, "past the old 1 MB Server Action limit").toBeGreaterThan(1024 * 1024);
  // PNG magic — a decoder must accept this, or the test would prove nothing.
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(png.length - 8).toString("latin1")).toContain("IEND");
});

test("a 2 MB image uploads and is stored as WebP", async ({ browser }) => {
  const admin = await newSession(browser, "super_admin");
  const branch = await firstBranch(admin.req);
  const category = await makeCategory(admin.req, branch.id);
  const name = uniq("BigImageProduct");

  const res = await admin.req.post("/api/products/", {
    multipart: {
      branch_id: String(branch.id),
      name,
      brand: "cheez",
      category: String(category.id),
      is_available: "true",
      variations: JSON.stringify([{ name: "Reg", price: 150, isDefault: true, isEnabled: true }]),
      image: {
        name: "big.png",
        mimeType: "image/png",
        // Larger than the OLD 1 MB body cap and, at 2 MB, well past what the
        // previous 5 MB validation limit would have allowed to grow to.
        buffer: makePngOfSize(2 * 1024 * 1024),
      },
    },
  });

  expect(res.status(), "no 413, no 500").toBe(201);
  const product = await res.json();
  expect(product.image, "an image was stored").toBeTruthy();
  // Whatever arrives is re-encoded — the stored key is always WebP.
  expect(String(product.image)).toMatch(/\.webp$/);

  // And it is actually served back.
  const fetched = await admin.req.get(`/api/uploads/${product.image}`);
  expect(fetched.status(), "the stored image is retrievable").toBe(200);
  const body = await fetched.body();
  expect(body.subarray(0, 4).toString("latin1"), "RIFF container").toBe("RIFF");
  expect(body.subarray(8, 12).toString("latin1"), "WebP payload").toBe("WEBP");

  await admin.context.close();
});

test("a 12 MB image uploads — past the old 10 MB proxy ceiling", async ({ browser }) => {
  const admin = await newSession(browser, "super_admin");
  const branch = await firstBranch(admin.req);
  const category = await makeCategory(admin.req, branch.id);
  const name = uniq("TwelveMbProduct");

  const res = await admin.req.post("/api/products/", {
    multipart: {
      branch_id: String(branch.id),
      name,
      brand: "cheez",
      category: String(category.id),
      is_available: "true",
      variations: JSON.stringify([{ name: "Reg", price: 150, isDefault: true, isEnabled: true }]),
      image: {
        name: "twelve.png",
        mimeType: "image/png",
        // 12 MB clears the OLD 10 MB `proxyClientMaxBodySize` default, which the
        // 2 MB case above would never have exercised — raising only
        // bodySizeLimit would still have failed here.
        buffer: makePngOfSize(12 * 1024 * 1024),
      },
    },
  });

  expect(res.status(), "accepted above the old 10 MB proxy cap").toBe(201);
  const product = await res.json();
  expect(String(product.image), "stored as WebP").toMatch(/\.webp$/);

  await admin.context.close();
});

test("a 2 MB image uploads through the product CREATE FORM (the failing path)", async ({
  browser,
}) => {
  const admin = await newSession(browser, "super_admin");
  const branch = await firstBranch(admin.req);
  await makeCategory(admin.req, branch.id);
  const name = uniq("FormBigImage");

  await admin.page.goto("/admin/products/create", { waitUntil: "domcontentloaded" });
  await admin.page.getByLabel(/^Branch/i).selectOption(String(branch.id));
  await admin.page.getByLabel(/^Product name/i).fill(name);
  await admin.page.getByLabel(/^Category/i).selectOption({ index: 1 });
  await admin.page.getByTestId("variation-name").fill("Regular");
  await admin.page.getByTestId("variation-price").fill("150");

  // This is the exact request that returned 413 → 500 → "Something went wrong".
  await admin.page.locator('input[type="file"][name="image"]').setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: makePngOfSize(2 * 1024 * 1024),
  });
  await admin.page.getByRole("button", { name: /add product/i }).click();

  // The action redirects to the list on success; a 413 previously produced the
  // error boundary instead.
  await expect(admin.page).toHaveURL(/\/admin\/products$/);
  await expect(admin.page.getByText(/something went wrong/i)).toHaveCount(0);

  const { results } = await (
    await admin.req.get(`/api/products/?search=${encodeURIComponent(name)}&page_size=5`)
  ).json();
  const created = (results as { name: string; image: string | null }[]).find((p) => p.name === name);
  expect(created, "the product was created").toBeTruthy();
  expect(created!.image, "with its image").toBeTruthy();
  expect(String(created!.image)).toMatch(/\.webp$/);

  await admin.context.close();
});
