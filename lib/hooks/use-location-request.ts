"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";

/**
 * ONE client-side live-location flow, shared by everything that lets a customer
 * share their GPS (the location card, the homepage branch bar, the branches-page
 * gate). Before this hook the exact same getCurrentPosition → POST
 * /api/customer/location → router.refresh() sequence was copy-pasted in two
 * places and drifting; §22 forbids a second competing location system, so the
 * sequence lives here and callers only map the resulting `phase` to their own
 * wording. No client-side distance/branch maths: the server re-resolves on refresh.
 */

export type LocationPhase =
  | "idle"
  | "requesting"
  | "saving"
  | "saved"
  | "lowaccuracy"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "error";

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/** Above this (metres) the fix is still saved but flagged coarse (req #12). */
export const LOW_ACCURACY_M = 100;

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 };

export interface UseLocationRequest {
  /** Kick off a location request. Safe to call from an effect or a click. */
  request: () => void;
  phase: LocationPhase;
  /** requesting || saving — for disabling buttons. */
  busy: boolean;
  /** Parsed save/permission error text when phase === "error"; null otherwise. */
  saveError: string | null;
  /** The most recent successfully-saved fix, for status display. */
  fix: LocationFix | null;
}

export function useLocationRequest(opts?: {
  /** Runs after a fix is saved (before the route refresh), for local UI state. */
  onSaved?: (fix: LocationFix) => void;
  /** Refresh the current route on success so the server re-resolves. Default true. */
  refresh?: boolean;
}): UseLocationRequest {
  const router = useRouter();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<LocationPhase>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  // Latest opts without making `request` identity depend on them (so an auto-fire
  // effect keyed on `request` doesn't re-run when a parent re-renders). The ref is
  // seeded with the initial opts and refreshed AFTER each render (never written
  // during render — that would violate react-hooks/refs); `request`'s async
  // callbacks always run post-commit, so they read the current opts.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  function request() {
    setSaveError(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPhase("unsupported");
      return;
    }
    setPhase("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setPhase("saving");
        try {
          const res = await fetch("/api/customer/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lat: latitude, lng: longitude, accuracy, captured_at: pos.timestamp }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            setSaveError(parseFieldErrors(body, t("location.errSave")).formError);
            setPhase("error");
            return;
          }
          const saved: LocationFix = { lat: latitude, lng: longitude, accuracy: accuracy ?? null };
          setFix(saved);
          optsRef.current?.onSaved?.(saved);
          setPhase(accuracy != null && accuracy > LOW_ACCURACY_M ? "lowaccuracy" : "saved");
          if (optsRef.current?.refresh !== false) router.refresh();
        } catch {
          setSaveError(t("location.errSave"));
          setPhase("error");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPhase("denied");
        else if (err.code === err.POSITION_UNAVAILABLE) setPhase("unavailable");
        else if (err.code === err.TIMEOUT) setPhase("timeout");
        else setPhase("error");
      },
      GEO_OPTIONS,
    );
  }

  return { request, phase, busy: phase === "requesting" || phase === "saving", saveError, fix };
}
