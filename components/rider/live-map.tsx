"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";

interface Loc {
  is_online: boolean;
  latitude: string | null;
  longitude: string | null;
  last_ping_at: string | null;
  rider_name: string;
}

/**
 * Live rider-location panel. Polls the tracking endpoint every 15s. Renders an
 * embedded Google Map only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; otherwise
 * shows a polished placeholder with the raw coordinates + last-seen time.
 */
export function LiveMap({ riderId, mapsKey }: { riderId: number; mapsKey: string | null }) {
  const { t, fmt } = useTranslation();
  const [loc, setLoc] = useState<Loc | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/riders/${riderId}/location`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Loc;
        if (alive) setLoc(data);
      } catch {
        /* ignore */
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [riderId]);

  const hasCoords = loc?.latitude && loc?.longitude;

  if (mapsKey && hasCoords) {
    const src = `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${loc!.latitude},${loc!.longitude}&zoom=15`;
    return (
      <div className="overflow-hidden rounded-xl">
        <iframe title="rider-map" src={src} className="aspect-video w-full border-0" loading="lazy" />
      </div>
    );
  }

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-slate-100 to-slate-200">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="relative text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-500/20 ring-4 ring-brand-500/10">
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-500 text-white">🛵</span>
        </div>
        {hasCoords ? (
          <>
            <p className="mt-3 text-sm font-medium text-fg-muted">
              {fmt.num(Number(loc!.latitude).toFixed(4))}, {fmt.num(Number(loc!.longitude).toFixed(4))}
            </p>
            <p className="text-xs text-fg-subtle">
              {loc!.is_online ? t("riderLoc.online") : t("riderLoc.offline")}
              {loc!.last_ping_at ? ` · ${fmt.dateTime(loc!.last_ping_at)}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">{t("riderLoc.noLocation")}</p>
        )}
        {!mapsKey ? <p className="mt-1 max-w-xs text-xs text-fg-subtle">{t("riderLoc.mapNote")}</p> : null}
      </div>
    </div>
  );
}
