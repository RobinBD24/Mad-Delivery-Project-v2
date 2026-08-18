import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CouponForm } from "@/components/marketing/marketing-forms";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.newCoupon") };
}

/** /marketing/coupons/create — dedicated create page. */
export default async function CreateCouponPage() {
  const { t } = await getT();
  await requireRole("marketing", "super_admin");

  return (
    <>
      <PageHeader
        title={t("marketingX.newCoupon")}
        subtitle={t("marketingX.couponsSub")}
        breadcrumbs={[
          { label: t("marketingX.couponsTitle"), href: "/marketing/coupons" },
          { label: t("marketingX.newCoupon") },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <CouponForm initial={null} />
        </CardContent>
      </Card>
    </>
  );
}
