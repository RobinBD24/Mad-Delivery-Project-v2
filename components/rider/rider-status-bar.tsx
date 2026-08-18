import { Icon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

function Item({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-fg-muted">
        <Icon name={icon} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
        <p className="truncate text-sm font-semibold text-fg-base">{value || "—"}</p>
      </div>
    </div>
  );
}

/** Bottom vehicle/status bar (design's footer: real profile + branch + live online state). */
export async function RiderStatusBar({ data }: { data: RiderDashboard }) {
  const { t } = await getT();

  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:flex-wrap md:items-center">
        <Item icon="bike" label={t("rider.vehicle")} value={data.profile.vehicle_type} />
        <Item icon="grid" label={t("rider.licensePlate")} value={data.profile.bike_registration_number} />
        <Item icon="phone" label={t("common.phone")} value={data.profile.phone} />
        <Item icon="store" label={t("rider.currentLocation")} value={data.assigned_branch?.name ?? "—"} />
        <div className="md:ml-auto" data-testid="rider-footer-status">
          <Badge tone={data.is_online ? "green" : "red"} dot>
            {data.is_online ? t("rider.online") : t("rider.offline")}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
