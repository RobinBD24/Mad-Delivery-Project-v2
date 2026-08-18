import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { json } from "@/lib/http/respond";
import { deleteUpload, saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, getCompanyLogoUrl, getSetting, setSetting } from "@/lib/services/settings";

// GET /api/admin/settings/logo — current global logo URL (super admin panel).
export const GET = handle(async () => {
  await requireApiRole("super_admin");
  return json({ url: await getCompanyLogoUrl() });
});

// POST /api/admin/settings/logo — SUPER ADMIN ONLY (req #3). Replaces the single
// global company logo. Image runs through the shared Sharp→WEBP pipeline
// (type + size validated) and is stored in runtime UPLOAD_DIR — never in
// build-time public/. The previous logo file is best-effort removed.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin");
  const { file } = await parseBody(req);
  const image = file("logo") ?? file("image");
  if (!image) throw validationError({ logo: sk("errors.upload.imageRequired") });
  const previous = await getSetting(SETTING_KEYS.companyLogo);
  const key = await saveUpload(image, "branding", "logo");
  await setSetting(SETTING_KEYS.companyLogo, key, me.id);
  if (previous && previous !== key) await deleteUpload(previous);
  return json({ url: await getCompanyLogoUrl() });
});

// DELETE /api/admin/settings/logo — SUPER ADMIN ONLY (req #3). Clears the logo;
// every surface falls back to the built-in brand mark.
export const DELETE = handle(async () => {
  await requireApiRole("super_admin");
  const previous = await getSetting(SETTING_KEYS.companyLogo);
  await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.companyLogo } });
  if (previous) await deleteUpload(previous);
  return json({ url: null });
});
