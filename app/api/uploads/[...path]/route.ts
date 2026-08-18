import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { contentTypeFor, resolveUploadPath } from "@/lib/upload/paths";

// Serve runtime-uploaded media from the writable UPLOAD_DIR (outside the build
// output). Files are read live per-request, so uploads work in production
// (`next start`) and survive a server restart — unlike files under `public/`.
//
// GET /api/uploads/profile_photos/<uuid>.webp
type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { path: segments } = await ctx.params;
  const key = (segments ?? []).join("/");
  const abs = resolveUploadPath(key);
  if (!abs) return new NextResponse("Not found", { status: 404 });

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
      // cache-busted with ?v= on replacement, so cache aggressively.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
