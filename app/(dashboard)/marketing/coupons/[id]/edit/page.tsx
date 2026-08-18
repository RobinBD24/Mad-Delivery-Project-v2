import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CouponForm, type CouponInitial } from "@/components/marketing/marketing-forms";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.editCoupon") };
}

type Params = { params: Promise<{ id: string }> };

/** /marketing/coupons/[id]/edit — dedicated edit page. */
export default async function EditCouponPage({ params }: Params) {
  const { t } = await getT();
  await requireRole("marketing", "super_admin");
  const { id } = await params;

  let coupon: CouponInitial;
  try {
    coupon = await getJSON<CouponInitial>(`/marketing/coupons/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={t("marketingX.editCoupon")}
        subtitle={coupon.code}
        breadcrumbs={[
          { label: t("marketingX.couponsTitle"), href: "/marketing/coupons" },
          { label: coupon.code },
          { label: t("common.edit") },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <CouponForm initial={coupon} />
        </CardContent>
      </Card>
    </>
  );
}
