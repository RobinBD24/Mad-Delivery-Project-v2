"use client";

import { useState, useEffect, useRef } from "react";

import { Icon } from "@/components/layout/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useLocationRequest } from "@/lib/hooks/use-location-request";

export interface LocationStatus {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: string | null;
}

/**
 * Customer GPS permission + status card. Automatically requests live location
 * on mount (with browser permission) or via button, saves to /api/customer/location,
 * and refreshes the page to instantly activate nearby branches. The request +
 * save + refresh sequence is the shared `useLocationRequest` hook (§22 — one
 * live-location implementation); this component only renders the status/wording.
 */
export function LocationPermissionCard({ initial }: { initial: LocationStatus }) {
  const { t, fmt } = useTranslation();
  const [status, setStatus] = useState<LocationStatus>(initial);
  const autoRequested = useRef(false);
  const { request, phase, busy, saveError } = useLocationRequest({
    onSaved: (fix) =>
      setStatus({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, updatedAt: new Date().toISOString() }),
  });

  const hasLocation = status.lat != null && status.lng != null;
  // Preserve the original mount behavior: with a location already on file, show
  // the success state immediately (the hook starts "idle"); a fresh save moves
  // the phase to "saved" itself.
  const showSaved = phase === "saved" || (phase === "idle" && hasLocation);

  // Automatically request location when customer lands if not yet set
  useEffect(() => {
    if (!autoRequested.current && (!initial.lat || !initial.lng)) {
      autoRequested.current = true;
      request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.lat, initial.lng]);

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

        {showSaved ? <Alert tone="success" message={t("location.savedOk")} /> : null}
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
