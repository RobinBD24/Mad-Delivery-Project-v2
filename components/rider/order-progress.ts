import type { OrderStatus } from "@/types";

/** The rider-facing delivery lifecycle (green step tracker + timeline). */
export interface RiderStep {
  key: OrderStatus;
  /** i18n key resolved at render time (e.g. "rider.stepAssigned"). */
  label: string;
  icon: string;
}

export const RIDER_STEPS: RiderStep[] = [
  { key: "ready", label: "rider.stepAssigned", icon: "📦" },
  { key: "picked_up", label: "rider.stepPickup", icon: "🛍️" },
  { key: "on_the_way", label: "rider.stepOnTheWay", icon: "🏍️" },
  { key: "delivered", label: "rider.stepDelivered", icon: "✅" },
];

/**
 * Index into RIDER_STEPS for a given order status.
 * Anything before `ready` (pending/accepted/preparing) sits at the first step,
 * `cancelled` returns -1.
 */
export function riderStepIndex(status: OrderStatus): number {
  if (status === "cancelled") return -1;
  const order: OrderStatus[] = [
    "pending",
    "accepted",
    "preparing",
    "ready",
    "picked_up",
    "on_the_way",
    "delivered",
  ];
  const rank = order.indexOf(status);
  const readyRank = order.indexOf("ready");
  if (rank <= readyRank) return 0;
  return rank - readyRank; // ready=0, picked_up=1, on_the_way=2, delivered=3
}
