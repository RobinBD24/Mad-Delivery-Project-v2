import { getT } from "@/lib/i18n/server";

/**
 * Static, dependency-free "live route" panel. Stands in for the old Leaflet map
 * (no map library allowed) — pickup → drop-off markers with a CSS route line,
 * a pulsing LIVE badge and an ETA overlay, all in the rider green theme.
 */
export async function RoutePanel({
  pickup,
  dropoff,
  eta,
  distance,
  className,
}: {
  pickup: string;
  dropoff: string;
  eta?: string;
  distance?: string;
  className?: string;
}) {
  const { t } = await getT();
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-rider-600/30 ${className ?? ""}`}
      style={{
        background:
          "radial-gradient(120% 120% at 15% 10%, #14532d 0%, #166534 45%, #15803d 100%)",
      }}
    >
      {/* faux street grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />

      {/* LIVE badge */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-rider-700 shadow">
        <span className="size-1.5 animate-pulse rounded-full bg-rider-500" />
        LIVE
      </div>

      {/* ETA overlay */}
      {eta ? (
        <div className="absolute right-3 top-3 rounded-xl bg-white/95 px-3 py-1.5 text-center shadow">
          <p className="text-[10px] text-fg-subtle">ETA</p>
          <p className="text-lg font-extrabold leading-none text-rider-600">{eta}</p>
          {distance ? <p className="text-[10px] text-fg-subtle">{distance}</p> : null}
        </div>
      ) : null}

      {/* route */}
      <div className="relative flex min-h-55 items-stretch gap-4 px-6 py-10">
        <div className="flex flex-col items-center pt-1">
          <span className="size-3.5 rounded-full border-2 border-white bg-amber-400 shadow" />
          <span
            className="w-0.5 flex-1"
            style={{ background: "repeating-linear-gradient(180deg,#fff 0 6px,transparent 6px 12px)" }}
          />
          <span className="size-3.5 rounded-full border-2 border-white bg-brand-500 shadow" />
        </div>
        <div className="flex flex-1 flex-col justify-between gap-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rider-50/70">{t("rider.pickup")}</p>
            <p className="text-sm font-semibold text-white">{pickup}</p>
          </div>
          {/* rider marker mid-route */}
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-rider-500 text-lg shadow-lg">
              🏍️
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white">
              {t("rider.riderMoving")}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rider-50/70">{t("rider.dropoff")}</p>
            <p className="text-sm font-semibold text-white">{dropoff}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
