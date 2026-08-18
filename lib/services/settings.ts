import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/utils";

/** Well-known SystemSetting keys. */
export const SETTING_KEYS = {
  riderCommissionPerDelivery: "rider_commission_per_delivery",
  // req #3 — single global company logo (upload storage key), super-admin only.
  companyLogo: "company_logo",
} as const;

/** Default per-delivery rider commission (Tk) until the super admin sets one. */
export const DEFAULT_RIDER_COMMISSION = "50.00";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string, updatedById?: number) {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedById: updatedById ?? null },
    create: { key, value, updatedById: updatedById ?? null },
  });
}

/** Current per-delivery commission as a Decimal (falls back to the default). */
export async function riderCommissionRate(): Promise<Prisma.Decimal> {
  const raw = await getSetting(SETTING_KEYS.riderCommissionPerDelivery);
  const value = raw !== null && !Number.isNaN(Number(raw)) ? raw : DEFAULT_RIDER_COMMISSION;
  return new Prisma.Decimal(value);
}

/**
 * Resolve the single global company logo (req #3) to a browser URL, or null
 * when none is configured (callers render the built-in brand mark fallback so
 * there is never a broken image). Cache-busted by the setting's updatedAt so a
 * replaced logo never shows a stale copy. The raw storage key/filesystem path
 * is never exposed — only the /api/uploads (or CDN) URL.
 */
export async function getCompanyLogoUrl(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.companyLogo } });
  if (!row?.value) return null;
  return mediaUrl(row.value, row.updatedAt ? String(row.updatedAt.getTime()) : null);
}
