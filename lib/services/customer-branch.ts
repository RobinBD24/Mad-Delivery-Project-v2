import "server-only";

import { prisma } from "@/lib/db";
import { coverageFor } from "@/lib/services/delivery";
import { nearestEligibleBranch } from "@/lib/services/customer-location";

/**
 * THE resolved delivery branch for an authenticated customer.
 *
 * This is a thin context wrapper over `nearestEligibleBranch` — the project's
 * existing nearest-branch service — not a second implementation of it. Distance,
 * coverage and eligibility are all computed there; this module only answers
 * "which branch is this customer ordering from right now, and if none, why not"
 * in the one shape every surface needs (homepage, product API, product detail,
 * cart, quote, checkout, order creation).
 *
 * Never accepts a branch id from the client. The only inputs are the customer's
 * own trusted GPS fix or their own default saved address.
 */

export type CustomerBranchState =
  /** A single nearest eligible branch was resolved. */
  | "ok"
  /** No usable coordinates at all — the customer must set a location. */
  | "no-location"
  /** We know where they are; no branch covers it. */
  | "out-of-zone";

export interface CustomerBranchContext {
  state: CustomerBranchState;
  /** The resolved branch id, or null in every non-"ok" state. */
  branchId: number | null;
  branch: {
    id: number;
    name: string;
    brandType: string;
    address: string;
    pickupEnabled: boolean;
    prepTimeMinutes: number;
  } | null;
  /** Straight-line distance to the resolved branch, km, server-computed. */
  distanceKm: number | null;
  /** Delivery fee for this point at this branch, from the shared coverage rules. */
  deliveryFee: number | null;
  /** Whether the point came from a GPS fix or the default saved address. */
  pointSource: "gps" | "address" | null;
}

const EMPTY: CustomerBranchContext = {
  state: "no-location",
  branchId: null,
  branch: null,
  distanceKm: null,
  deliveryFee: null,
  pointSource: null,
};

/**
 * Resolve the customer's single ordering branch.
 *
 * Deliberately NOT cached: it depends on one customer's private coordinates, so
 * a shared cache entry here is exactly the leak that would serve customer B the
 * branch resolved for customer A. The branch CATALOGUE is cached instead, keyed
 * by branch id (see lib/services/public-catalog.ts) — that data is not private.
 */
export async function resolveCustomerBranch(userId: number): Promise<CustomerBranchContext> {
  const nearest = await nearestEligibleBranch(userId);
  if (!nearest.point) return EMPTY;
  if (!nearest.nearest) {
    return { ...EMPTY, state: "out-of-zone", pointSource: nearest.pointSource };
  }

  const branch = await prisma.branch.findFirst({
    // Re-checked here rather than assumed: the branch must still be a live
    // customer choice at the moment we hand its id to the catalogue.
    where: { id: nearest.nearest.id, isActive: true, isArchived: false },
  });
  if (!branch) {
    return { ...EMPTY, state: "out-of-zone", pointSource: nearest.pointSource };
  }

  // Delivery fee comes from the same coverage rules the order pipeline uses, so
  // the figure shown on the homepage is the one that will be charged.
  const zones = await prisma.branchDeliveryZone.findMany({
    where: { branchId: branch.id, isActive: true },
  });
  const coverage = coverageFor(branch, zones, nearest.point);

  return {
    state: "ok",
    branchId: branch.id,
    branch: {
      id: branch.id,
      name: branch.name,
      brandType: branch.brandType,
      address: branch.address,
      pickupEnabled: branch.pickupEnabled,
      prepTimeMinutes: branch.prepTimeMinutes,
    },
    distanceKm: nearest.nearest.distance_km,
    deliveryFee: coverage.covered ? coverage.fee : null,
    pointSource: nearest.pointSource,
  };
}

/**
 * The resolved branch id, or null. Used by the enforcement points that only need
 * to answer "may this customer touch branch X?".
 */
export async function resolvedBranchIdFor(userId: number): Promise<number | null> {
  const context = await resolveCustomerBranch(userId);
  return context.branchId;
}
