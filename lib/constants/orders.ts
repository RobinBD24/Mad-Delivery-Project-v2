// Order lifecycle rules — ported from apps/orders/constants.py
import type { OrderStatus } from "@/types";

// Valid forward transitions of the order lifecycle.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered"],
  delivered: [],
  cancelled: [],
};

// Which statuses each role is allowed to *set*.
export const BRANCH_MANAGER_SETTABLE: OrderStatus[] = [
  "accepted",
  "preparing",
  "ready",
  "cancelled",
];
export const RIDER_SETTABLE: OrderStatus[] = ["picked_up", "on_the_way", "delivered"];
export const CUSTOMER_SETTABLE: OrderStatus[] = ["cancelled"];

