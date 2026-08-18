import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { quoteOrder } from "@/lib/services/orders";
import type { OrderItemInput } from "@/lib/services/orders";

// POST /api/delivery/quote — req #6. Server-derived checkout summary: subtotal,
// delivery charge, prep time, delivery estimate, overall estimate and total are
// all computed on the server from the DB (never trusted from the client), using
// the SAME branch/area/pricing rules as placing the order. Held/inactive/foreign
// areas and unavailable products throw the same translated validation errors.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  if (me.role !== "customer") throw forbidden(sk("errors.orders.onlyCustomerCanOrder"));
  const body = (await req.json().catch(() => ({}))) as {
    branch_id?: number;
    items?: OrderItemInput[];
    fulfillment_type?: string;
    lat?: number | string;
    lng?: number | string;
    delivery_area_id?: number | null;
  };
  const quote = await quoteOrder({
    branchId: Number(body.branch_id),
    items: body.items ?? [],
    fulfillmentType: body.fulfillment_type,
    lat: body.lat != null && body.lat !== "" ? Number(body.lat) : null,
    lng: body.lng != null && body.lng !== "" ? Number(body.lng) : null,
    deliveryAreaId: body.delivery_area_id ?? null,
    // Pinned to this customer's own resolved branch, exactly as order creation
    // is — a quote priced against a different branch would be a stale total.
    customerId: me.id,
  });
  return json(quote);
});
