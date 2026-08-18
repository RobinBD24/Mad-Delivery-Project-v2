import type { Metadata } from "next";

import { CartView } from "@/components/orders/cart-view";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("customer.cartTitle") };
}

export default async function CartPage() {
  await requireRole("customer");
  const { t } = await getT();

  return (
    <>
      <PageHeader title={t("customer.myCart")} subtitle={t("customer.myCartSubtitle")} />
      <CartView />
    </>
  );
}
