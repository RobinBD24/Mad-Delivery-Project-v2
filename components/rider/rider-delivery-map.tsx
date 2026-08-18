import { Icon } from "@/components/layout/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";

/**
 * Light map-style placeholder (no paid map API / no API key). Shows pickup +
 * drop-off markers and a route line over a subtle grid. Distance/ETA are
 * estimates until real geolocation is wired — labeled as such.
 */
export async function RiderDeliveryMap({
  pickup,
  dropoff,
}: {
  pickup: string | null;
  dropoff: string | null;
}) {
  const { t } = await getT();

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t("rider.deliveryMap")}
        action={<span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">{t("rider.estLabel")}</span>}
      />
      <div className="relative h-64 w-full overflow-hidden bg-surface-muted">
        {/* faux street grid */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
            backgroundSize: "38px 38px",
          }}
        />
        {/* route line */}
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 256" preserveAspectRatio="none" aria-hidden>
          <polyline
            points="70,190 150,190 150,110 300,110 300,70"
            fill="none"
            stroke="#16a34a"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 10"
          />
        </svg>
        {/* pickup marker */}
        <div className="absolute bottom-14 left-14 flex flex-col items-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
            <Icon name="store" className="size-4" />
          </span>
        </div>
        {/* dropoff marker */}
        <div className="absolute right-20 top-8 flex flex-col items-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
            <Icon name="pin" className="size-4" />
          </span>
        </div>
        {/* distance / ETA chips */}
        <div className="absolute left-4 top-4 flex gap-3 rounded-xl border border-border-base bg-surface-card/90 px-4 py-2 shadow-sm backdrop-blur">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-fg-subtle">{t("rider.distanceLabel")}</p>
            <p className="text-sm font-bold text-fg-base">{t("rider.estimatedDistance")}</p>
          </div>
          <div className="border-l border-border-base pl-3">
            <p className="text-[10px] uppercase tracking-wide text-fg-subtle">{t("rider.etaLabel")}</p>
            <p className="text-sm font-bold text-emerald-600">{t("rider.etaValue")}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-3 text-xs">
        <span className="flex items-center gap-1.5 text-fg-muted"><span className="size-2 rounded-full bg-emerald-600" /> {pickup || t("rider.pickupLocation")}</span>
        <Icon name="chevron" className="size-3.5 text-slate-300" />
        <span className="flex items-center gap-1.5 text-fg-muted"><span className="size-2 rounded-full bg-brand-500" /> {dropoff || t("rider.dropoffLocation")}</span>
      </div>
    </Card>
  );
}
