"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Rider GPS tracker (req #12). While the rider is on duty, requests browser
 * geolocation once, then watches position and pushes throttled updates to
 * /api/riders/location (server validates + requires an active duty session).
 * Handles granted / denied / unavailable / timeout without re-prompting in a
 * loop. Stops when `onDuty` is false. Renders a tiny non-blocking status chip.
 */
export function RiderLocationTracker({ onDuty }: { onDuty: boolean }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "on" | "denied" | "unavailable">("idle");
  const lastSent = useRef(0);
  const lastPoint = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!onDuty) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Defer out of the effect body (avoids sync setState-in-effect).
      const id = setTimeout(() => setStatus("unavailable"), 0);
      return () => clearTimeout(id);
    }
    let watchId: number | null = null;
    const send = (lat: number, lng: number, accuracy?: number, capturedAt?: number) => {
      const now = Date.now();
      const moved = !lastPoint.current
        || Math.abs(lastPoint.current.lat - lat) > 0.0003
        || Math.abs(lastPoint.current.lng - lng) > 0.0003;
      // Throttle: at most every 15s, and only on meaningful movement or first fix.
      if (now - lastSent.current < 15000 && !moved) return;
      lastSent.current = now;
      lastPoint.current = { lat, lng };
      void fetch("/api/riders/location/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // PHASE E — capture time travels with the fix; the server refuses a
        // stale one instead of recording an old position as the rider's current.
        body: JSON.stringify({ lat, lng, accuracy, captured_at: capturedAt ?? Date.now() }),
      }).catch(() => {});
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("on");
        send(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp);
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [onDuty]);

  // PHASE E — the rider always sees the GPS state while on duty, including the
  // healthy one. A silent tracker leaves them unable to tell "working" from
  // "quietly broken".
  if (!onDuty || status === "idle") return null;
  const tone =
    status === "on" ? "bg-emerald-600/90" : status === "denied" ? "bg-red-600/90" : "bg-amber-500/90";
  return (
    <div
      className={`fixed bottom-3 left-3 z-40 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow ${tone}`}
      data-testid="rider-gps-status"
      data-status={status}
    >
      {status === "on"
        ? t("location.riderTracking")
        : status === "denied"
          ? t("location.riderDenied")
          : t("location.riderUnavailable")}
    </div>
  );
}
