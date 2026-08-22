import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { contentTypeFor, resolveUploadPath } from "@/lib/upload/paths";

// Serve runtime-uploaded media from the writable UPLOAD_DIR (outside the build
// output). Files are read live per-request, so uploads work in production
// (`next start`) and survive a server restart — unlike files under `public/`.
//
// GET /api/uploads/profile_photos/<uuid>.webp
type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Storage-key top-level folders that are PUBLIC by design: brand / storefront /
 * catalogue media the anonymous homepage and login page must render for
 * logged-out visitors. These are the only `saveUpload()` subdirs shown outside
 * an authenticated session (see lib/services/public-catalog.ts,
 * lib/services/settings.ts, components/home/*).
 *
 * Every OTHER folder is PRIVATE — it holds personal or HR/KYC data
 * (`profile_photos`, `employee_photos`, and any future rider NID/licence folder
 * for RiderProfile.nidFrontImage / nidBackImage / licenseImage) and is only
 * ever displayed inside an authenticated dashboard. Anything not explicitly
 * listed here is treated as private, so unknown / future folders FAIL CLOSED.
 */
const PUBLIC_SUBDIRS = new Set(["products", "branch_logos", "branding", "ramadan_menus"]);

export const GET = handle(async (_req: Request, ctx: Ctx): Promise<Response> => {
  const { path: segments } = await ctx.params;
  const key = (segments ?? []).join("/");
  // Path-traversal / arbitrary-file guard: rejects any key that is malformed or
  // resolves outside UPLOAD_DIR (see resolveUploadPath). Runs BEFORE auth so a
  // crafted path can never reach the filesystem.
  const abs = resolveUploadPath(key);
  if (!abs) return new NextResponse("Not found", { status: 404 });

  // H-1: private media must never be served to an unauthenticated or unapproved
  // caller. Only the public brand/catalogue folders skip the check; everything
  // else requires an approved session. requireApproved() throws 401 (anon) or
  // 403 (pending/rejected/blocked), which handle() turns into a JSON response —
  // an <img> then falls back to initials instead of leaking the file.
  const isPublic = PUBLIC_SUBDIRS.has(key.split("/")[0] ?? "");
  if (!isPublic) await requireApproved();

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(abs),
      // Filenames are content-addressed (uuid) and never rewritten; the URL is
      // cache-busted with ?v= on replacement, so cache aggressively. Public
      // assets may sit in shared caches (CDN/proxy); private assets are scoped
      // to the authenticated browser only, so a shared cache can never hand one
      // user's photo/KYC file to another.
      "Cache-Control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, max-age=31536000, immutable",
    },
  });
});
