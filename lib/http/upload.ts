import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { sk, validationError } from "@/lib/http/errors";
import { resolveUploadPath, uploadDir } from "@/lib/upload/paths";
import { imageFileProblem } from "@/lib/validation/limits";

const WEBP_QUALITY = 80;

/**
 * WebP cannot encode a side longer than 16383 pixels — libwebp throws outright.
 * A source above that is scaled down to fit; anything smaller is left at its
 * original dimensions. This is the difference between "any image the user picks
 * is accepted" and an unexplained failure on a large panorama or scan.
 */
const WEBP_MAX_SIDE = 16383;

/**
 * Persist an uploaded image into the runtime UPLOAD_DIR (see lib/upload/paths)
 * and return a stable STORAGE KEY — e.g. "profile_photos/<uuid>.webp" — which
 * is what gets stored in the database. The key is served back to the browser by
 * the /api/uploads route handler, so it works in dev and production (`next
 * start`) alike, and never depends on `public/` being rebuilt.
 *
 * Every accepted image is re-encoded to WebP (EXIF orientation applied, metadata
 * stripped). Validates extension, MIME type and size; the filename is a random
 * uuid inside a fixed subdir, so there is no path-traversal surface.
 */
export async function saveUpload(
  file: File,
  subdir: string,
  field = "image",
): Promise<string> {
  // Accept only image files: extension AND (when the browser supplies one) MIME.
  // Exactly the check the client ran before sending — one shared implementation,
  // so a file the browser accepted is never rejected here for a different rule.
  const problem = imageFileProblem({ name: file.name, type: file.type, size: file.size });
  if (problem === "type") {
    throw validationError({ [field]: sk("errors.upload.imageTypeInvalid") });
  }
  if (problem === "size") {
    throw validationError({ [field]: sk("errors.upload.imageTooLarge") });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await sharp(input, {
      // Sharp refuses images above ~268 megapixels by default. Uploads are
      // explicitly allowed to be any size, so the guard is lifted here — the
      // size ceiling is enforced by MAX_IMAGE_BYTES above, not by pixel count.
      limitInputPixels: false,
      // Decode images with recoverable defects (a truncated JPEG, a bad CRC)
      // instead of throwing. The user gets their picture; they do not get an
      // "invalid image type" message about a file that opens fine elsewhere.
      failOn: "none",
    })
      // `.rotate()` bakes in EXIF orientation before the metadata is dropped.
      .rotate()
      // Only shrinks a source that WebP physically cannot encode; `fit: inside`
      // preserves the aspect ratio and `withoutEnlargement` means a small image
      // is never upscaled.
      .resize({
        width: WEBP_MAX_SIDE,
        height: WEBP_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    // Not a decodable image despite its extension/MIME.
    throw validationError({ [field]: sk("errors.upload.imageTypeInvalid") });
  }

  const key = `${subdir}/${randomUUID()}.webp`;
  const abs = resolveUploadPath(key)!; // key is built from a uuid — always safe
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, webp);
  return key;
}

/**
 * Best-effort delete of a previously stored upload when it is replaced. Only
 * acts on bare runtime storage keys (e.g. "profile_photos/<uuid>.webp"); legacy
 * rooted paths ("/uploads/…", absolute URLs) are ignored so nothing outside the
 * upload dir is ever touched.
 */
export async function deleteUpload(key: string | null | undefined): Promise<void> {
  if (!key || key.startsWith("/") || /^https?:\/\//i.test(key)) return;
  const abs = resolveUploadPath(key);
  if (!abs || !abs.startsWith(uploadDir())) return;
  await unlink(abs).catch(() => {}); // already gone / never written — fine
}

/** True when a form value is a non-empty uploaded File. */
export function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}
