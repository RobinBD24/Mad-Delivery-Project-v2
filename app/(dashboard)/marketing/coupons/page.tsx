import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { CouponDeleteButton } from "@/components/marketing/marketing-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.couponsTitle") };
}

interface CouponT {
  id: number;
  code: string;
  discount_type: string;
  value: string;
  min_order: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
}

/** /marketing/coupons — coupon list with create/edit/delete. */
export default async function MarketingCouponsPage() {
  const { t, fmt } = await getT();
  await requireRole("marketing", "super_admin");
  const data = await getJSON<Paginated<CouponT>>("/marketing/coupons/");

  return (
    <>
      <PageHeader
        title={t("pages.couponsTitle")}
        subtitle={t("marketingX.couponsSub")}
        action={
          <ButtonLink href="/marketing/coupons/create">
            <Icon name="plus" className="size-4" /> {t("marketingX.newCoupon")}
          </ButtonLink>
        }
      />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState
            title={t("marketingX.noCoupons")}
            description={t("marketingX.noCouponsDesc")}
            action={<ButtonLink href="/marketing/coupons/create" size="sm">{t("marketingX.newCoupon")}</ButtonLink>}
          />
        ) : (
          <Table headers={[t("marketingX.codeLabel"), t("marketingX.discountLabel"), t("marketingX.minOrderLabel"), t("marketingX.usageLabel"), t("pages.colStatus"), t("pages.colActions")]}>
            {data.results.map((c) => (
              <tr key={c.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-mono font-semibold text-fg-base">{c.code}</span></Td>
                <Td>
                  {c.discount_type === "percent"
                    ? `${fmt.num(Number(c.value))}%`
                    : fmt.money(c.value)}
                </Td>
                <Td>{Number(c.min_order) > 0 ? fmt.money(c.min_order) : "—"}</Td>
                <Td>
                  <span className="text-sm">
                    {fmt.num(c.used_count)}
                    {c.max_uses > 0 ? ` / ${fmt.num(c.max_uses)}` : ""}
                  </span>
                </Td>
                <Td>
                  <Badge tone={c.is_active ? "green" : "slate"}>
                    {c.is_active ? t("marketingX.active") : t("marketingX.inactive")}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <span className="flex items-center justify-end gap-2">
                    <Link href={`/marketing/coupons/${c.id}/edit`} className="text-sm font-medium text-fg-muted hover:text-brand-600 hover:underline">
                      {t("common.edit")}
                    </Link>
                    <CouponDeleteButton couponId={c.id} />
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
