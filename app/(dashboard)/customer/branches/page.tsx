import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, ButtonLink } from "@/components/ui/button";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n/server";
import { mediaUrl, cn } from "@/lib/utils";
import { nearestEligibleBranch, customerLocationStatus } from "@/lib/services/customer-location";
import { BranchLocationPanel } from "@/components/customer/branch-location-panel";
import { LocationPermissionCard } from "@/components/customer/location-permission-card";
import type { Branch, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("customer.restaurantsTitle") };
}

/**
 * req #20/#4 — the customer may order only from their nearest ELIGIBLE branch
 * (computed server-side from trusted GPS / default-address coordinates). The
 * nearest eligible branch is enabled; every other branch is rendered disabled
 * (not a link, not focusable) with an explanation. When there is no location or
 * no eligible branch, a clear message is shown.
 */
export default async function CustomerBranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  await requireRole("customer");
  const { t, fmt } = await getT();
  const me = (await getSessionUser())!;
  // req #11 — search runs SERVER-SIDE (trimmed, case-insensitive, matches branch
  // name / address / active delivery-area names). It filters the list only; it
  // can never re-enable a non-nearest branch, because eligibility is computed
  // independently by nearestEligibleBranch below.
  const search = ((await searchParams).search ?? "").trim();
  const query = new URLSearchParams({ page_size: "100" });
  if (search) query.set("search", search);
  const [data, nearest, locationStatus] = await Promise.all([
    getJSON<Paginated<Branch>>(`/branches/?${query.toString()}`),
    nearestEligibleBranch(me.id),
    customerLocationStatus(me.id),
  ]);
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const nearestId = nearest.nearest?.id ?? null;
  const distanceById = new Map(nearest.branches.map((b) => [b.id, b.distance_km]));
  const coveredById = new Map(nearest.branches.map((b) => [b.id, b.covered]));
  const hasCoveredBranches = nearest.branches.some((b) => b.covered);
  // Out of zone = we DO know where they are, and nothing covers it.
  const outOfZone = Boolean(nearest.point) && !hasCoveredBranches;

  return (
    <>
      <PageHeader title={t("customer.restaurantsTitle")} subtitle={t("customer.restaurantsSubtitle")} />

      {!nearest.point ? (
        <div className="mb-4" data-testid="location-setup">
          <LocationPermissionCard
            initial={{
              lat: locationStatus.lat,
              lng: locationStatus.lng,
              accuracy: locationStatus.accuracy,
              updatedAt: locationStatus.updatedAt,
            }}
          />
        </div>
      ) : null}

      {/* Branch search (server-side GET form) */}
      <form method="GET" noValidate className="mb-4 flex flex-wrap items-center gap-2" data-testid="branch-search-form">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder={t("branchSearch.placeholder")}
          aria-label={t("branchSearch.placeholder")}
          data-testid="branch-search-input"
          className="w-full max-w-xs rounded-xl border border-border-strong bg-surface-card px-3.5 py-2.5 text-sm text-fg-base placeholder:text-fg-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/20 sm:w-auto"
        />
        <Button type="submit" size="sm" data-testid="branch-search-submit">{t("branchSearch.submit")}</Button>
        {search ? (
          <ButtonLink href="/customer/branches" size="sm" variant="outline" data-testid="branch-search-clear">
            {t("branchSearch.clear")}
          </ButtonLink>
        ) : null}
      </form>

      {/* Explanation banner */}
      <div className="mb-4 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" data-testid="nearest-explainer">
        {hasCoveredBranches
          ? t("nearestBranch.explainerEnabled", { branch: nearest.nearest?.name ?? "" })
          : nearest.point
            ? t("nearestBranch.explainerNone")
            : t("nearestBranch.explainerNoLocation")}
        {!nearest.point ? (
          <span className="ml-2 inline-block">
            <ButtonLink href="/customer/addresses" size="sm" variant="outline">{t("nearestBranch.setLocation")}</ButtonLink>
          </span>
        ) : null}
      </div>

      {/* Outside every branch's coverage banner */}
      {outOfZone ? (
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
            <ButtonLink href="/customer/branches" size="sm" variant="outline" data-testid="out-of-zone-retry">
              {t("outOfZone.retry")}
            </ButtonLink>
          </span>
        </div>
      ) : null}

      {data.results.length === 0 ? (
        search ? (
          <EmptyState
            title={t("branchSearch.noResultsTitle")}
            description={t("branchSearch.noResultsDesc", { query: search })}
            action={<ButtonLink href="/customer/branches">{t("branchSearch.clear")}</ButtonLink>}
          />
        ) : (
          <EmptyState title={t("customer.noOpenRestaurants")} description={t("customer.noOpenRestaurantsDesc")} />
        )
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.results.map((branch) => {
            const logo = mediaUrl(branch.logo);
            const covered = coveredById.get(branch.id) ?? false;
            const isNearest = branch.id === nearestId && covered;
            const enabled = covered;
            const inner = (
              <>
                <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-ink-900 to-ink-950">
                  {logo ? (
                    <Image src={logo} alt={branch.name} width={64} height={64} className="size-16 rounded-2xl object-cover" />
                  ) : (
                    <span className="text-4xl">🏪</span>
                  )}
                  {isNearest ? (
                    <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm" data-testid="branch-nearest-badge">
                      {t("nearestBranch.nearestBadge")}
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <h3 className={cn("font-semibold", enabled ? "text-fg-base group-hover:text-brand-600" : "text-fg-muted")}>{branch.name}</h3>
                  <p className="mt-0.5 line-clamp-1 text-sm text-fg-muted">📍 {branch.address}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fg-subtle">
                    <span data-testid="branch-brand">{branch.brand_type}</span>
                    <span>📞 {branch.phone}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-fg-subtle">
                    <span data-testid="branch-hours">
                      {branch.opening_time && branch.closing_time
                        ? `🕒 ${branch.opening_time} – ${branch.closing_time}`
                        : t("outOfZone.hoursUnknown")}
                    </span>
                    <span>{t("customer.deliveryRadius", { km: fmt.num(branch.delivery_radius_km) })}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="text-fg-subtle" data-testid="branch-distance">
                      {distanceById.get(branch.id) != null
                        ? t("outOfZone.distanceKm", { km: fmt.num(distanceById.get(branch.id)!) })
                        : t("outOfZone.distanceUnknown")}
                    </span>
                    <span
                      className={enabled ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-400"}
                      data-testid="branch-delivery-availability"
                    >
                      {enabled ? t("outOfZone.deliveryAvailable") : t("outOfZone.deliveryUnavailable")}
                    </span>
                  </div>
                  {!enabled ? (
                    <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="branch-disabled-note">
                      {t("nearestBranch.disabledNote")}
                    </p>
                  ) : null}
                  <BranchLocationPanel
                    branchName={branch.name}
                    address={branch.address}
                    distanceKm={distanceById.get(branch.id) ?? null}
                    covered={enabled}
                    mapsKey={mapsKey}
                  />
                </div>
              </>
            );
            return enabled ? (
              <Link
                key={branch.id}
                href={`/customer/branches/${branch.id}/menu`}
                data-testid="branch-enabled"
                className="group overflow-hidden rounded-2xl border border-emerald-400/80 bg-surface-card shadow-card transition-all hover:border-emerald-500 hover:shadow-card-hover"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={branch.id}
                aria-disabled="true"
                tabIndex={-1}
                data-testid="branch-disabled"
                className="pointer-events-none cursor-not-allowed select-none overflow-hidden rounded-2xl border border-border-base/80 bg-surface-card opacity-60 shadow-card"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
