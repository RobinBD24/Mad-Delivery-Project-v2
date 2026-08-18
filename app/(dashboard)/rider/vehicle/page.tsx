import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { RiderProfile } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.vehicleTitle") };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg-base">{value || "—"}</span>
    </div>
  );
}

/** /rider/vehicle — the rider's own vehicle + document info (read-only). */
export default async function RiderVehiclePage() {
  const { t } = await getT();
  await requireRole("rider");
  const profile = await getJSON<RiderProfile>("/riders/me/");

  return (
    <>
      <PageHeader title={t("rider.vehicleTitle")} subtitle={t("rider.vehicleSub")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("rider.vehicleTitle")} />
          <CardContent className="divide-y divide-border-base">
            <Row label={t("rider.vehicleType")} value={profile.vehicle_type} />
            <Row label={t("rider.regNo")} value={profile.bike_registration_number} />
            <Row label={t("rider.licenseNo")} value={profile.driving_license_number} />
            <Row label={t("rider.assignedBranchLabel")} value={profile.assigned_branch_name ?? "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("nav.profile")} />
          <CardContent className="divide-y divide-border-base">
            <Row label={t("rider.nidNo")} value={profile.nid_number} />
            <Row label={t("rider.bloodGroup")} value={profile.blood_group} />
            <Row label={t("common.phone")} value={profile.rider_phone} />
            <Row label={t("rider.presentAddress")} value={profile.present_address} />
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-center text-xs text-fg-subtle">{t("rider.readonlyNote")}</p>
    </>
  );
}
