// Convert every raster image under public/ to .webp (in place, same folder).
//
// Usage:
//   node scripts/convert-images-to-webp.mjs           # convert, keep originals
//   node scripts/convert-images-to-webp.mjs --delete   # also remove originals
//   node scripts/convert-images-to-webp.mjs --dir public/images  # limit scope
//
// Rules:
//   - Converts .jpg .jpeg .png .bmp .tiff .tif .avif → .webp
//   - Preserves folder structure (writes alongside the source)
//   - Skips when an up-to-date .webp already exists (no duplicate work)
//   - Leaves .svg .ico .webp and non-images untouched
//   - Quality 80 (safe visual/size trade-off); EXIF orientation baked in
//   - Only removes originals with --delete, AFTER a successful conversion
import { readdir, stat, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONVERTIBLE = new Set([".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".avif"]);
const QUALITY = 80;

const argv = process.argv.slice(2);
const DELETE = argv.includes("--delete");
const dirArg = argv.find((a) => a.startsWith("--dir="))?.split("=")[1];
const SCAN_DIR = path.resolve(ROOT, dirArg ?? "public");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function newerThan(a, b) {
  // true when file `a` is newer than file `b` (source changed after last convert)
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  return sa.mtimeMs > sb.mtimeMs;
}

const rel = (p) => path.relative(ROOT, p);

async function main() {
  const converted = [];
  const skipped = [];
  const removed = [];
  const failed = [];
  let scanned = 0;

  for await (const file of walk(SCAN_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!CONVERTIBLE.has(ext)) continue;
    scanned++;
    const out = file.slice(0, -ext.length) + ".webp";

    try {
      let exists = false;
      try {
        await stat(out);
        exists = true;
      } catch {
        exists = false;
      }
      // Skip if a .webp already exists and is not older than the source.
      if (exists && !(await newerThan(file, out))) {
        skipped.push(rel(out));
      } else {
        const input = await readFile(file);
        const webp = await sharp(input).rotate().webp({ quality: QUALITY }).toBuffer();
        await writeFile(out, webp);
        converted.push(rel(out));
        console.log(`✓ ${rel(file)} → ${rel(out)}`);
      }

      if (DELETE) {
        await unlink(file);
        removed.push(rel(file));
        console.log(`  removed original ${rel(file)}`);
      }
    } catch (err) {
      failed.push(rel(file));
      console.error(`✗ ${rel(file)}: ${err.message}`);
    }
  }

  console.log("\n── image conversion summary ──");
  console.log(`scanned convertible:  ${scanned}`);
  console.log(`converted:            ${converted.length}`);
  console.log(`skipped (up to date): ${skipped.length}`);
  console.log(`originals removed:    ${removed.length}`);
  console.log(`failed:               ${failed.length}`);
  if (failed.length) {
    console.error("FAILED:", failed.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
