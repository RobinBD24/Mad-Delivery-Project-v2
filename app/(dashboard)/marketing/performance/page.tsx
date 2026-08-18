import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.performanceTitle") };
}

/** /marketing/performance — campaign & coupon performance (redemptions/reach). */
export default async function MarketingPerformancePage() {
  const { t, fmt } = await getT();
  await requireRole("marketing", "super_admin");

  const [campaigns, coupons, sends, couponOrders] = await Promise.all([
    prisma.campaign.count(),
    prisma.coupon.findMany({ orderBy: { usedCount: "desc" } }),
    prisma.notice.findMany({ where: { type: "marketing" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.order.aggregate({ where: { couponId: { not: null } }, _sum: { discountAmount: true }, _count: true }),
  ]);

  const totalRedemptions = coupons.reduce((a, c) => a + c.usedCount, 0);
  const totalReach = sends.reduce((a, s) => a + s.recipients, 0);

  return (
    <>
      <PageHeader title={t("marketingX.performanceTitle")} subtitle={t("marketingX.performanceSub")} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("marketingX.totalCampaigns")} value={fmt.num(campaigns)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("marketingX.totalRedemptions")} value={fmt.num(totalRedemptions)} icon={<Icon name="check" />} accent="green" />
        <StatCard label={t("marketingX.discountGiven")} value={fmt.money(couponOrders._sum.discountAmount?.toString() ?? "0")} icon={<Icon name="money" />} accent="amber" />
        <StatCard label={t("marketingX.notificationReach")} value={fmt.num(totalReach)} icon={<Icon name="megaphone" />} accent="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("marketingX.couponPerformance")} />
          {coupons.length === 0 ? (
            <EmptyState title={t("marketingX.noCoupons")} />
          ) : (
            <Table headers={[t("marketingX.codeLabel"), t("marketingX.redemptions"), t("marketingX.discountLabel")]}>
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-mono font-semibold text-fg-base">{c.code}</span></Td>
                  <Td>{fmt.num(c.usedCount)}{c.maxUses > 0 ? ` / ${fmt.num(c.maxUses)}` : ""}</Td>
                  <Td>{c.discountType === "percent" ? `${fmt.num(Number(c.value))}%` : fmt.money(c.value.toString())}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("marketingX.sentNotifications")} />
          {sends.length === 0 ? (
            <EmptyState title={t("marketingX.noSends")} />
          ) : (
            <Table headers={[t("notices.subject"), t("marketingX.reach"), t("pages.colDate")]}>
              {sends.map((s) => (
                <tr key={s.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{s.title}</span></Td>
                  <Td>{fmt.num(s.recipients)}</Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(s.createdAt.toISOString())}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
