"use client";

import { useState } from "react";

import { Icon } from "@/components/layout/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";

export interface LocationStatus {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: string | null;
}

// Above this (metres) we still save the fix but warn the customer it is coarse
// and offer a retry for a tighter one (req #12 low-accuracy handling).
const LOW_ACCURACY_M = 100;

type Phase =
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

/**
 * req #12/#21 — customer GPS permission + status card. Explains what the live
 * location is used for, requests it via the Geolocation API, and handles every
 * outcome (granted / denied / unavailable / timeout / low-accuracy / unsupported)
 * with a retry. Saves through POST /api/customer/location, which is kept SEPARATE
 * from saved addresses and never overwrites the default address.
 */
export function LocationPermissionCard({ initial }: { initial: LocationStatus }) {
  const { t, fmt } = useTranslation();
  const [status, setStatus] = useState<LocationStatus>(initial);
  const [phase, setPhase] = useState<Phase>(initial.lat != null ? "saved" : "idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasLocation = status.lat != null && status.lng != null;
  const busy = phase === "requesting" || phase === "saving";

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
            // PHASE E — send when the browser captured the fix so the server can
            // refuse a stale/replayed reading rather than store it as current.
            body: JSON.stringify({ lat: latitude, lng: longitude, accuracy, captured_at: pos.timestamp }),
          });
          if (!res.ok) {
            // No user-editable field exists here (the coordinates come from the
            // browser), so the server's message is shown at form level. Raw
            // payloads are never surfaced.
            const body = await res.json().catch(() => null);
            setSaveError(parseFieldErrors(body, t("location.errSave")).formError);
            setPhase("error");
            return;
          }
          setStatus({ lat: latitude, lng: longitude, accuracy, updatedAt: new Date().toISOString() });
          setPhase(accuracy != null && accuracy > LOW_ACCURACY_M ? "lowaccuracy" : "saved");
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
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  // Map the terminal error phases to a translated message + tone.
  const problem: { tone: "error" | "warning"; message: string } | null =
    phase === "denied"
      ? { tone: "error", message: t("location.errDenied") }
      : phase === "unavailable"
        ? { tone: "error", message: t("location.errUnavailable") }
        : phase === "timeout"
          ? { tone: "warning", message: t("location.errTimeout") }
          : phase === "unsupported"
            ? { tone: "error", message: t("location.errUnsupported") }
            : phase === "error"
              ? { tone: "error", message: saveError ?? t("location.errSave") }
              : phase === "lowaccuracy"
                ? {
                    tone: "warning",
                    message: t("location.lowAccuracy", {
                      m: fmt.num(Math.round(status.accuracy ?? 0)),
                    }),
                  }
                : null;

  return (
    <div data-testid="location-card">
      <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Icon name="pin" className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-fg-base">{t("location.title")}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t("location.uses")}</p>
          </div>
        </div>

        {/* Current saved status (independent of saved addresses). */}
        <div
          className="rounded-xl bg-surface-muted px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
          data-testid="location-status"
        >
          {hasLocation ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <Icon name="check" className="size-4" /> {t("location.statusSaved")}
              </span>
              {status.accuracy != null ? (
                <span className="text-fg-subtle">{t("location.accuracy", { m: fmt.num(Math.round(status.accuracy)) })}</span>
              ) : null}
              {status.updatedAt ? (
                <span className="text-fg-subtle">{t("location.savedAt", { when: fmt.dateTime(status.updatedAt) })}</span>
              ) : null}
            </div>
          ) : (
            <span className="text-fg-muted">{t("location.statusNotSet")}</span>
          )}
        </div>

        {phase === "saved" ? <Alert tone="success" message={t("location.savedOk")} /> : null}
        {problem ? <Alert tone={problem.tone} message={problem.message} /> : null}

        <div className="flex items-center gap-3">
          <Button onClick={request} disabled={busy} data-testid="location-enable">
            <Icon name="pin" className="size-4" />
            {busy
              ? phase === "saving"
                ? t("location.saving")
                : t("location.requesting")
              : hasLocation
                ? t("location.update")
                : t("location.enable")}
          </Button>
          {problem ? (
            <Button variant="outline" onClick={request} disabled={busy} data-testid="location-retry">
              {t("location.retry")}
            </Button>
          ) : null}
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
