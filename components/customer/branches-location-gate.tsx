"use client";

import { useEffect, useRef } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { LocationPermissionCard, type LocationStatus } from "@/components/customer/location-permission-card";
import { useTranslation } from "@/lib/i18n/use-translation";
import { useLocationRequest } from "@/lib/hooks/use-location-request";

/**
 * Owns the "where are you?" region at the top of the customer branches page and
 * closes Gap #2 (§2 stale saved address / §16 detecting state):
 *
 *  - No usable location at all → the permission card (which auto-requests on mount).
 *  - A SAVED ADDRESS that looks out of zone → the customer may actually be inside
 *    a coverage area right now, so auto-fire the SAME shared live-GPS flow the
 *    homepage uses (no second location system — §22) and show "Finding
 *    restaurants near you…" INSTEAD of a premature "out of coverage" banner. On
 *    success the server re-resolves off the fresh GPS fix (router.refresh, inside
 *    the hook); if it is still out of zone the point source is now "gps", so the
 *    truthful banner shows on the next render.
 *  - A real out-of-zone / all-closed result → the honest banner, with a WORKING
 *    "Check my location again" that performs a live GPS re-request (the old inert
 *    link is gone — §16).
 *
 * The page's explainer strip stays SERVER-rendered and always visible; this gate
 * never owns or suppresses it.
 */
export function BranchesLocationGate({
  hasPoint,
  pointSource,
  outOfZone,
  allCoveredClosed,
  nearestName,
  opensAt,
  locationInitial,
}: {
  hasPoint: boolean;
  pointSource: "gps" | "address" | null;
  outOfZone: boolean;
  allCoveredClosed: boolean;
  nearestName: string | null;
  opensAt: string | null;
  locationInitial: LocationStatus;
}) {
  const { t } = useTranslation();
  const { request, phase, busy, saveError } = useLocationRequest();
  const autoFired = useRef(false);

  // The ONLY case this gate auto-detects: a stored address that puts the customer
  // out of zone (the false-negative §16 is about). The no-point case is owned by
  // the card, which auto-requests itself — so we must not double-fire here — and a
  // GPS-sourced out-of-zone is the truth, not a stale address, so it is left alone.
  const autoDetectAddress = hasPoint && pointSource === "address" && outOfZone;
  useEffect(() => {
    if (autoDetectAddress && !autoFired.current) {
      autoFired.current = true;
      request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetectAddress]);

  // "Finding…" replaces the premature banner only while that auto-detect (or a
  // manual retry of it) is in flight; a manual retry from an already-truthful
  // banner just shows an inline "locating" on the button.
  const detecting = busy && autoDetectAddress;

  // No usable location at all → the permission card (auto-requests on mount). Same
  // testid the page used before, so the existing e2e coverage still finds it.
  if (!hasPoint) {
    return (
      <div className="mb-4" data-testid="location-setup">
        <LocationPermissionCard initial={locationInitial} />
      </div>
    );
  }

  if (detecting) {
    return (
      <div
        className="mb-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
        role="status"
        aria-live="polite"
        data-testid="branches-detecting"
      >
        <span className="size-2 animate-pulse rounded-full bg-brand-500" aria-hidden />
        {t("nearestBranch.finding")}
      </div>
    );
  }

  // A refusal points at the saved default address (the documented fallback);
  // other failures get a short inline message under the banner.
  const errorText =
    phase === "denied"
      ? t("nearestHome.deniedUseAddress")
      : phase === "unsupported"
        ? t("location.errUnsupported")
        : phase === "unavailable" || phase === "timeout"
          ? t("location.errUnavailable")
          : phase === "error"
            ? saveError ?? t("location.errUnavailable")
            : null;

  // Covered branches exist but every one of them is closed right now — not "out of
  // zone", so its own banner names the branch and when it reopens.
  if (allCoveredClosed) {
    return (
      <div
        className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        data-testid="all-closed-banner"
      >
        <p className="font-medium">{t("outOfZone.allClosedTitle")}</p>
        {opensAt ? (
          <p className="mt-0.5">{t("outOfZone.allClosedBody", { branch: nearestName ?? "", time: opensAt })}</p>
        ) : null}
      </div>
    );
  }

  if (outOfZone) {
    return (
      <div
        className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        data-testid="out-of-zone-banner"
      >
        <p className="font-medium">{t("outOfZone.title")}</p>
        <p className="mt-0.5">{t("outOfZone.body")}</p>
        <span className="mt-2 inline-flex flex-wrap gap-2">
          <ButtonLink href="/customer/addresses" size="sm" variant="outline" data-testid="out-of-zone-update-address">
            {t("outOfZone.updateAddress")}
          </ButtonLink>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={request}
            disabled={busy}
            data-testid="out-of-zone-retry"
          >
            {busy ? t("nearestHome.locating") : t("outOfZone.retry")}
          </Button>
        </span>
        {errorText ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="alert">
            {errorText}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
