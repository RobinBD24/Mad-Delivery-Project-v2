import type { Metadata } from "next";
import Image from "next/image";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewForm } from "@/components/customer/review-form";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("reviews.title") };
}

/** /customer/reviews — rate riders & review food from delivered orders. */
export default async function CustomerReviewsPage() {
  const { t, fmt } = await getT();
  const me = await requireRole("customer");
  const userId = Number(me.id);

  const [orders, riderReviews, foodReviews] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: userId, status: "delivered" },
      include: {
        items: { include: { product: true } },
        rider: true,
        riderReview: true,
        foodReviews: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.riderReview.findMany({
      where: { customerId: userId },
      include: { rider: true, order: { include: { branch: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.foodReview.findMany({
      where: { customerId: userId },
      include: { product: true, order: { include: { branch: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Orders with anything still reviewable.
  const pending = orders
    .map((o) => {
      const riderPending = o.riderId && !o.riderReview;
      const foodPending = o.items.filter(
        (i) => !o.foodReviews.some((r) => r.productId === i.productId),
      );
      return { order: o, riderPending, foodPending };
    })
    .filter((x) => x.riderPending || x.foodPending.length > 0);

  const given = [
    ...riderReviews.map((r) => ({
      id: `r${r.id}`,
      label: t("reviews.riderLabel", {
        name: `${r.rider.firstName} ${r.rider.lastName}`.trim() || r.rider.username,
      }),
      image: null as string | null,
      branch: r.order?.branch?.name ?? null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    ...foodReviews.map((r) => ({
      id: `f${r.id}`,
      label: r.product.name,
      image: r.product.image ? mediaUrl(r.product.image) : null,
      branch: r.order?.branch?.name ?? null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <>
      <PageHeader title={t("reviews.title")} subtitle={t("reviews.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("reviews.pendingTitle")} subtitle={t("reviews.pendingSub")} />
          <CardContent className="space-y-5">
            {pending.length === 0 ? (
              <EmptyState title={t("reviews.nonePending")} description={t("reviews.nonePendingDesc")} />
            ) : (
              pending.map(({ order, riderPending, foodPending }) => (
                <div key={order.id} className="space-y-3">
                  <p className="text-sm font-semibold text-fg-base">
                    {t("customer.orderNumber", { id: fmt.num(order.id) })} · {fmt.date(order.createdAt.toISOString())}
                  </p>
                  {riderPending && order.rider ? (
                    <ReviewForm
                      orderId={order.id}
                      type="rider"
                      targetLabel={t("reviews.riderLabel", {
                        name: `${order.rider.firstName} ${order.rider.lastName}`.trim() || order.rider.username,
                      })}
                    />
                  ) : null}
                  {foodPending.map((item) => (
                    <ReviewForm
                      key={item.id}
                      orderId={order.id}
                      type="food"
                      productId={item.productId}
                      targetLabel={item.product?.name ?? ""}
                    />
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("reviews.givenTitle")} />
          {given.length === 0 ? (
            <EmptyState title={t("reviews.noneGiven")} description={t("reviews.noneGivenDesc")} />
          ) : (
            <CardContent className="p-0">
              <ul className="divide-y divide-border-base">
                {given.map((r) => (
                  <li key={r.id} className="flex gap-3 px-5 py-3">
                    {r.image ? (
                      <Image
                        src={r.image}
                        alt={r.label}
                        width={48}
                        height={48}
                        className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-fg-base">{r.label}</p>
                        <span className="shrink-0 text-amber-400">
                          {"★".repeat(r.rating)}
                          <span className="text-slate-200">{"★".repeat(5 - r.rating)}</span>
                        </span>
                      </div>
                      {r.branch ? (
                        <p className="mt-0.5 text-xs font-medium text-brand-600">{r.branch}</p>
                      ) : null}
                      {r.comment ? <p className="mt-0.5 text-sm text-fg-muted">{r.comment}</p> : null}
                      <p className="mt-1 text-xs text-fg-subtle">{fmt.dateTime(r.createdAt.toISOString())}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
