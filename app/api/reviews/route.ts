import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { createNotification, notifyBranchManagers } from "@/lib/services/notifications";

// POST /api/reviews  { order_id, type: "rider"|"food", rating, comment, product_id? }
// Customer reviews own DELIVERED orders only; once per order (rider) / order+product (food).
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as {
    order_id?: number;
    type?: string;
    rating?: number;
    comment?: string;
    product_id?: number;
  };

  const rating = Math.floor(Number(body.rating));
  if (!rating || rating < 1 || rating > 5) throw validationError({ rating: sk("errors.ops.ratingRange") });
  if (body.type !== "rider" && body.type !== "food") throw validationError({ type: sk("errors.ops.reviewTypeInvalid") });

  const order = await prisma.order.findFirst({
    where: { id: Number(body.order_id), customerId: me.id },
    include: { items: true },
  });
  if (!order) throw notFound(sk("errors.ops.orderNotFound"));
  if (order.status !== "delivered") {
    throw validationError({ order_id: sk("errors.ops.reviewDeliveredOnly") });
  }

  const comment = String(body.comment ?? "").trim();

  try {
    if (body.type === "rider") {
      if (!order.riderId) throw validationError({ order_id: sk("errors.ops.orderHadNoRider") });
      const review = await prisma.riderReview.create({
        data: { orderId: order.id, customerId: me.id, riderId: order.riderId, rating, comment },
      });
      await createNotification(order.riderId, {
        type: "system",
        titleKey: "notifications.review.received.title",
        bodyKey: "notifications.review.received.body",
        params: { id: order.id, rating },
        link: "/rider/performance",
      });
      return created({ id: review.id, type: "rider", rating: review.rating, comment: review.comment });
    }

    const productId = Number(body.product_id);
    if (!order.items.some((i) => i.productId === productId)) {
      throw validationError({ product_id: sk("errors.ops.productNotInOrder") });
    }
    const review = await prisma.foodReview.create({
      data: { orderId: order.id, productId, customerId: me.id, rating, comment },
    });
    // Let the branch's managers know a food/order review landed.
    await notifyBranchManagers(order.branchId, {
      type: "review",
      titleKey: "notifications.review.received.title",
      bodyKey: "notifications.review.received.body",
      params: { id: order.id, rating },
      link: `/branch-manager/orders/${order.id}`,
    });
    return created({ id: review.id, type: "food", rating: review.rating, comment: review.comment });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw validationError({ order_id: sk("errors.ops.reviewAlreadyGiven") });
    }
    throw err;
  }
});
