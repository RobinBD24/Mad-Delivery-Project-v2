import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DeliverySettingsPanel } from "@/components/branch/delivery-settings-panel";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { branchForManager } from "@/lib/selectors";
import { prisma } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("bmExtras.zoneTitle") };
}

/** /branch-manager/delivery-zone — coverage radius/center, prep time, pickup
 * point, and named delivery zones (own branch). */
export default async function DeliveryZonePage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  const me = (await getSessionUser())!;
  const branch = (await branchForManager(me.id))!;
  const zones = await prisma.branchDeliveryZone.findMany({ where: { branchId: branch.id }, orderBy: { createdAt: "asc" } });

  const settings = {
    branch_id: branch.id,
    latitude: branch.latitude?.toString() ?? null,
    longitude: branch.longitude?.toString() ?? null,
    delivery_radius_km: branch.deliveryRadiusKm.toString(),
    prep_time_minutes: branch.prepTimeMinutes,
    pickup_enabled: branch.pickupEnabled,
    pickup_address: branch.pickupAddress,
    pickup_phone: branch.pickupPhone,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      center_lat: z.centerLat.toString(),
      center_lng: z.centerLng.toString(),
      radius_km: z.radiusKm.toString(),
      delivery_fee: z.deliveryFee.toString(),
      is_active: z.isActive,
    })),
  };

  return (
    <>
      <PageHeader title={t("bmExtras.zoneTitle")} subtitle={t("bmExtras.zoneSub")} />
      <Card className="max-w-3xl">
        <CardHeader title={t("bmExtras.zoneSettings")} />
        <CardContent>
          <DeliverySettingsPanel settings={settings} />
        </CardContent>
      </Card>
    </>
  );
}
