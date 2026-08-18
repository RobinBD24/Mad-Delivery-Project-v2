"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";

export interface BranchBarContext {
  state: "ok" | "no-location" | "out-of-zone";
  branchName: string | null;
  brandType: string | null;
  distanceKm: number | null;
  deliveryFee: number | null;
  pickupEnabled: boolean;
  prepTimeMinutes: number | null;
}

/**
 * Compact branch context strip for the AUTHENTICATED customer homepage.
 *
 * Deliberately a single slim band in the storefront's own dark palette, not a
 * dashboard panel: the brief is to add branch context without redesigning the
 * page, so it sits between the hero and the menu and takes one line on desktop.
 *
 * It carries the three states the server can resolve — a branch, no usable
 * location, or a location outside every coverage area — and in each case offers
 * only the actions that can actually change the outcome. It never lets the
 * customer pick a different branch: delivery is assigned to the nearest eligible
 * branch, server-side.
 */
export function BranchBar({ context }: { context: BranchBarContext }) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Requests a fix and saves it through the SAME endpoint the customer
   * location card uses — no second location system, no client-side distance
   * maths. The server re-derives the nearest branch on the refresh.
   */
  function useCurrentLocation() {
    setError(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError(t("location.errUnsupported"));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/customer/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              captured_at: pos.timestamp,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            setError(parseFieldErrors(body, t("location.errSave")).formError);
            return;
          }
          // Server re-resolves the branch and the catalogue for this request.
          router.refresh();
        } catch {
          setError(t("location.errSave"));
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        // A refusal is not an error state to nag about — the saved default
        // address is the documented fallback, so say so and offer it.
        if (err.code === err.PERMISSION_DENIED) setError(t("nearestHome.deniedUseAddress"));
        else setError(t("location.errUnavailable"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const action =
    "rounded-lg border border-white/15 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors hover:border-brand-500 hover:bg-white/5 disabled:opacity-60";

  return (
    <section
      className="border-b border-white/8 bg-[#111115] px-4 py-3"
      data-testid="home-branch-bar"
      data-branch-state={context.state}
      aria-label={t("nearestHome.regionLabel")}
    >
      <div className="mx-auto flex max-w-300 flex-wrap items-center gap-x-4 gap-y-2 text-[0.82rem]">
        {context.state === "ok" ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden>📍</span>
              <span className="text-[#a0a0b0]">{t("nearestHome.yourBranch")}</span>
              <span className="truncate font-bold text-white" data-testid="home-branch-name">
                {context.branchName}
              </span>
            </span>
            {context.brandType ? (
              <span className="rounded-full border border-white/10 bg-[#1c1c24] px-2.5 py-0.5 text-[0.72rem] font-semibold text-[#a0a0b0]">
                {t(`brandType.${context.brandType}`)}
              </span>
            ) : null}
            {context.distanceKm != null ? (
              <span className="text-[#a0a0b0]" data-testid="home-branch-distance">
                {t("nearestHome.distance", { km: fmt.num(context.distanceKm) })}
              </span>
            ) : null}
            {context.prepTimeMinutes != null ? (
              <span className="text-[#a0a0b0]">
                ⏱ {fmt.num(context.prepTimeMinutes)} {t("catalog.minutes")}
              </span>
            ) : null}
            {context.deliveryFee != null ? (
              <span className="text-[#a0a0b0]" data-testid="home-branch-fee">
                {t("nearestHome.deliveryFee", { fee: fmt.money(context.deliveryFee) })}
              </span>
            ) : null}
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={useCurrentLocation} disabled={busy} className={action}>
                {busy ? t("nearestHome.locating") : t("nearestHome.changeLocation")}
              </button>
              <Link href="/customer/addresses" className={action}>
                {t("nearestHome.selectAddress")}
              </Link>
            </span>
          </>
        ) : null}

        {context.state === "no-location" ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden>📍</span>
              <span className="font-semibold text-white">{t("nearestHome.locationRequired")}</span>
              <span className="truncate text-[#a0a0b0]">{t("nearestHome.locationRequiredBody")}</span>
            </span>
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={busy}
                className={action}
                data-testid="home-use-location"
              >
                {busy ? t("nearestHome.locating") : t("nearestHome.useCurrentLocation")}
              </button>
              <Link href="/customer/addresses" className={action} data-testid="home-select-address">
                {t("nearestHome.selectAddress")}
              </Link>
              <Link href="/customer/addresses" className={action}>
                {t("nearestHome.addAddress")}
              </Link>
            </span>
          </>
        ) : null}

        {context.state === "out-of-zone" ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden>⚠️</span>
              <span className="font-semibold text-white">{t("outOfZone.title")}</span>
              <span className="truncate text-[#a0a0b0]">{t("nearestHome.outOfZoneBody")}</span>
            </span>
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={busy}
                className={action}
                data-testid="home-retry-location"
              >
                {busy ? t("nearestHome.locating") : t("outOfZone.retry")}
              </button>
              <Link href="/customer/addresses" className={action}>
                {t("outOfZone.updateAddress")}
              </Link>
              <Link href="/customer/branches" className={action} data-testid="home-view-branches">
                {t("nearestHome.viewBranches")}
              </Link>
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="mx-auto mt-2 max-w-300 text-[0.78rem] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
