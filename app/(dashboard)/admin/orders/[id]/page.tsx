import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderDetailCard } from "@/components/orders/order-detail-card";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.orderDetailTitle") };
}

/** /admin/orders/[id] — super admin read-only order detail (sees every order). */
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  await requireRole("super_admin");
  const { id } = await params;

  let order: Order;
  try {
    order = await getJSON<Order>(`/orders/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={t("pages.orderDetailTitle")}
        subtitle={order.branch_name}
        breadcrumbs={[
          { label: t("pages.ordersTitle"), href: "/admin/orders" },
          { label: order.order_number || `#${order.id}` },
        ]}
        action={
          <ButtonLink href="/admin/orders" variant="outline">
            {t("pages.backToOrders")}
          </ButtonLink>
        }
      />
      <OrderDetailCard order={order} />
    </>
  );
}
