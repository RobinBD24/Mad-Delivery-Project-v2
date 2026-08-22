import "server-only";

import { prisma } from "@/lib/db";
import { coverageFor } from "@/lib/services/delivery";
import { isBranchCoveredForCustomer, nearestEligibleBranch } from "@/lib/services/customer-location";

export { isBranchCoveredForCustomer };

/**
 * THE resolved delivery branch for an authenticated customer.
 * Supports choosing any branch that currently covers the customer's coordinates (Foodpanda model),
 * with fallback to the nearest covered branch.
 */

export type CustomerBranchState =
  /** A single eligible branch was resolved. */
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
  /** Whether the resolved branch can take an order right now (active + within hours). */
  open: boolean;
  /** Opening time ("HH:MM") to show when the branch is currently closed; null otherwise. */
  opensAt: string | null;
}

const EMPTY: CustomerBranchContext = {
  state: "no-location",
  branchId: null,
  branch: null,
  distanceKm: null,
  deliveryFee: null,
  pointSource: null,
  open: false,
  opensAt: null,
};

/**
 * Resolve the customer's delivery branch (supports preferred covered branch or nearest covered branch).
 */
export async function resolveCustomerBranch(userId: number, preferredBranchId?: number | null): Promise<CustomerBranchContext> {
  const nearest = await nearestEligibleBranch(userId);
  if (!nearest.point) return EMPTY;

  let targetBranchId: number | null = null;
  let targetDistance: number | null = null;

  if (preferredBranchId != null) {
    const match = nearest.branches.find((b) => b.id === preferredBranchId && b.covered);
    if (match) {
      targetBranchId = match.id;
      targetDistance = match.distance_km;
    }
  }

  if (targetBranchId == null) {
    if (!nearest.nearest) {
      return { ...EMPTY, state: "out-of-zone", pointSource: nearest.pointSource };
    }
    targetBranchId = nearest.nearest.id;
    targetDistance = nearest.nearest.distance_km;
  }

  const branch = await prisma.branch.findFirst({
    where: { id: targetBranchId, isActive: true, isArchived: false },
  });
  if (!branch) {
    return { ...EMPTY, state: "out-of-zone", pointSource: nearest.pointSource };
  }

  const zones = await prisma.branchDeliveryZone.findMany({
    where: { branchId: branch.id, isActive: true },
  });
  const coverage = coverageFor(branch, zones, nearest.point);

  // Open-now state comes from the SAME server decision used everywhere else
  // (nearestEligibleBranch already computed it per branch). Surfaced so the
  // homepage strip can warn "Opens at …" before a cart is built for a branch
  // that is covered but closed right now.
  const elig = nearest.branches.find((b) => b.id === targetBranchId) ?? null;
  const open = elig?.open_now ?? true;

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
    distanceKm: targetDistance,
    deliveryFee: coverage.covered ? coverage.fee : null,
    pointSource: nearest.pointSource,
    open,
    opensAt: open ? null : elig?.opens_at ?? null,
  };
}

/**
 * The resolved branch id, or null.
 */
export async function resolvedBranchIdFor(userId: number, preferredBranchId?: number | null): Promise<number | null> {
  const context = await resolveCustomerBranch(userId, preferredBranchId);
  return context.branchId;
}
