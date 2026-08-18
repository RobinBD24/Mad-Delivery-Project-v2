"use client";

import { useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * PHASE F — branch location, with a map only when one is actually available.
 *
 * When a public Maps key is configured the embed is mounted LAZILY: the iframe
 * is created on demand, so a page listing a dozen branches does not fetch a
 * dozen maps nobody asked for. When no key is configured, or the embed fails to
 * load, the fallback is not an apology — it is the information a customer
 * actually needs: the address, the server-computed distance, the coverage
 * verdict and a directions link.
 *
 * The map is presentation only. Distance and coverage come from the server and
 * are passed in already decided; nothing here recomputes them, so a tampered
 * client cannot talk itself into a delivery it is not entitled to.
 *
 * The query used for both the embed and the directions link is the branch
 * ADDRESS, never raw stored coordinates — the branch's exact latitude/longitude
 * stay server-side.
 */
export function BranchLocationPanel({
  branchName,
  address,
  distanceKm,
  covered,
  mapsKey,
}: {
  branchName: string;
  address: string;
  /** Server-computed distance, or null when the customer has no location. */
  distanceKm: number | null;
  /** Server's coverage verdict for this branch. */
  covered: boolean;
  mapsKey: string | null;
}) {
  const { t, fmt } = useTranslation();
  const [showMap, setShowMap] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const query = encodeURIComponent(`${branchName} ${address}`);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  const canEmbed = Boolean(mapsKey) && !mapFailed;

  return (
    <div className="mt-2 rounded-lg border border-border-base p-2.5 text-xs" data-testid="branch-location-panel">
      <p className="text-fg-base">📍 {address}</p>
      <p className="mt-1 text-fg-subtle" data-testid="branch-location-distance">
        {distanceKm != null ? t("outOfZone.distanceKm", { km: fmt.num(distanceKm) }) : t("outOfZone.distanceUnknown")}
      </p>
      <p
        className={`mt-1 font-medium ${covered ? "text-emerald-600" : "text-amber-600 dark:text-amber-400"}`}
        data-testid="branch-location-coverage"
      >
        {covered ? t("outOfZone.deliveryAvailable") : t("outOfZone.deliveryUnavailable")}
      </p>

      {/* PHASE A — these are real touch targets, not text links squeezed into
          18px: they get a finger-sized hit area on a phone. */}
      <div className="mt-2 flex flex-wrap gap-3">
        <a
          href={directions}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-8 items-center font-medium text-brand-600 hover:underline"
          data-testid="branch-directions-link"
        >
          {t("maps.directions")}
        </a>
        {canEmbed && !showMap ? (
          <button
            type="button"
            className="inline-flex min-h-8 items-center font-medium text-brand-600 hover:underline"
            onClick={() => setShowMap(true)}
            data-testid="branch-show-map"
          >
            {t("maps.showMap")}
          </button>
        ) : null}
      </div>

      {canEmbed && showMap ? (
        <iframe
          title={`${branchName} — ${t("maps.showMap")}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${query}`}
          className="mt-2 h-40 w-full rounded-lg border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onError={() => setMapFailed(true)}
          data-testid="branch-map-embed"
        />
      ) : null}

      {!mapsKey ? (
        <p className="mt-2 text-fg-subtle" data-testid="branch-map-fallback">
          {t("maps.unavailable")}
        </p>
      ) : null}
    </div>
  );
}
