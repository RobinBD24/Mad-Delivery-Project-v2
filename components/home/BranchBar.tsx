"use client";

import Link from "next/link";

import { useTranslation } from "@/lib/i18n/use-translation";
import { useLocationRequest } from "@/lib/hooks/use-location-request";

export interface BranchBarContext {
  state: "ok" | "no-location" | "out-of-zone";
  branchName: string | null;
  brandType: string | null;
  distanceKm: number | null;
  deliveryFee: number | null;
  pickupEnabled: boolean;
  prepTimeMinutes: number | null;
  /** Whether the resolved branch can take an order right now. */
  open: boolean;
  /** Opening time ("HH:MM") shown when the branch is currently closed. */
  opensAt: string | null;
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
  // Same shared live-location flow the location card uses — no second location
  // system, no client-side distance maths. The server re-derives the nearest
  // branch on the refresh the hook performs.
  const { request, phase, busy, saveError } = useLocationRequest();

  // A refusal is not an error state to nag about — the saved default address is
  // the documented fallback, so point at it; other failures surface a short
  // inline message.
  const error =
    phase === "denied"
      ? t("nearestHome.deniedUseAddress")
      : phase === "unsupported"
        ? t("location.errUnsupported")
        : phase === "unavailable" || phase === "timeout"
          ? t("location.errUnavailable")
          : phase === "error"
            ? saveError ?? t("location.errUnavailable")
            : null;

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
            {!context.open && context.opensAt ? (
              <span
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[0.72rem] font-semibold text-amber-300"
                data-testid="home-branch-closed"
              >
                🕒 {t("nearestBranch.opensAt", { time: context.opensAt })}
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
              <button type="button" onClick={request} disabled={busy} className={action}>
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
                onClick={request}
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
                onClick={request}
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
