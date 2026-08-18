"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { pushRiderLocationAction, setRiderOnlineAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

/**
 * Rider online/offline switch. While online, the browser's geolocation is
 * pushed to the server every 20s so customers/branch managers can track the
 * rider live. Requires HTTPS + user permission (browser Geolocation API).
 */
export function OnlineTracker({ initialOnline }: { initialOnline: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline);
  const [pending, setPending] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  function startWatch() {
    if (!("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        void pushRiderLocationAction(pos.coords.latitude, pos.coords.longitude);
      },
      () => setGeoError(t("riderLoc.geoDenied")),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 15_000 },
    );
  }

  function stopWatch() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  useEffect(() => {
    if (online) startWatch();
    return stopWatch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function toggle() {
    const next = !online;
    setPending(true);
    const res = await setRiderOnlineAction(next);
    setPending(false);
    if (!res.error) {
      setOnline(next);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
          online ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-slate-200 text-fg-muted hover:bg-slate-300",
        )}
      >
        <span className={cn("size-2.5 rounded-full", online ? "bg-surface-card" : "bg-slate-400")} />
        {online ? t("riderLoc.online") : t("riderLoc.offline")}
      </button>
      {online ? <p className="text-xs text-fg-subtle">{t("riderLoc.tracking")}</p> : null}
      {geoError ? <p className="text-xs text-amber-600">{geoError}</p> : null}
    </div>
  );
}
