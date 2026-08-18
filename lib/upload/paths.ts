import "server-only";
import path from "node:path";

/**
 * Runtime upload storage lives OUTSIDE the build output (not in `public/` or
 * `.next/`), because Next.js `next start` serves `public/` from a build-time
 * snapshot — files written there after the build 404 in production. Files here
 * are read live per-request by the /api/uploads route handler, so uploads work
 * in dev, `next build && next start`, and after a server restart.
 *
 * Default: `<cwd>/storage/uploads`. Override with the `UPLOAD_DIR` env var
 * (relative to cwd, or an absolute persistent-disk path in production).
 */
export function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim() || "storage/uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

/** Storage keys are POSIX-style relative paths, e.g. "profile_photos/<uuid>.webp". */
const KEY_RE = /^[a-zA-Z0-9._/-]+$/;

/**
 * Resolve a storage key to an absolute path INSIDE the upload dir, or null if
 * the key is malformed or would escape the directory (path-traversal guard).
 */
export function resolveUploadPath(key: string): string | null {
  if (!key || !KEY_RE.test(key) || key.includes("..")) return null;
  const root = uploadDir();
  const abs = path.resolve(root, key);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

/** MIME type for a stored filename (defaults to octet-stream). */
export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
