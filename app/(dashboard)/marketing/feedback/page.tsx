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
  return { title: t("marketingX.feedbackTitle") };
}

/** /marketing/feedback — customer/rider feedback (food + rider reviews). */
export default async function MarketingFeedbackPage() {
  const { t, fmt } = await getT();
  await requireRole("marketing", "super_admin");

  const [foodReviews, riderReviews, foodAgg, riderAgg] = await Promise.all([
    prisma.foodReview.findMany({ include: { product: true, customer: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.riderReview.findMany({ include: { rider: true, customer: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.foodReview.aggregate({ _avg: { rating: true }, _count: true }),
    prisma.riderReview.aggregate({ _avg: { rating: true }, _count: true }),
  ]);

  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

  return (
    <>
      <PageHeader title={t("marketingX.feedbackTitle")} subtitle={t("marketingX.feedbackSub")} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("marketingX.avgFoodRating")} value={foodAgg._avg.rating ? foodAgg._avg.rating.toFixed(1) : "—"} icon={<Icon name="grid" />} accent="amber" />
        <StatCard label={t("marketingX.foodReviews")} value={fmt.num(foodAgg._count)} icon={<Icon name="list" />} accent="brand" />
        <StatCard label={t("marketingX.avgRiderRating")} value={riderAgg._avg.rating ? riderAgg._avg.rating.toFixed(1) : "—"} icon={<Icon name="bike" />} accent="green" />
        <StatCard label={t("marketingX.riderReviews")} value={fmt.num(riderAgg._count)} icon={<Icon name="users" />} accent="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("marketingX.foodFeedback")} />
          {foodReviews.length === 0 ? (
            <EmptyState title={t("marketingX.noFeedback")} />
          ) : (
            <Table headers={[t("adminExtras.colProduct"), t("marketingX.rating"), t("marketingX.comment")]}>
              {foodReviews.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{r.product?.name ?? "—"}</span></Td>
                  <Td><span className="text-amber-400">{stars(r.rating)}</span></Td>
                  <Td><span className="text-sm text-fg-muted">{r.comment || "—"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("marketingX.riderFeedback")} />
          {riderReviews.length === 0 ? (
            <EmptyState title={t("marketingX.noFeedback")} />
          ) : (
            <Table headers={[t("wallet.colRider"), t("marketingX.rating"), t("marketingX.comment")]}>
              {riderReviews.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover/70">
                  <Td>{`${r.rider.firstName} ${r.rider.lastName}`.trim() || r.rider.username}</Td>
                  <Td><span className="text-amber-400">{stars(r.rating)}</span></Td>
                  <Td><span className="text-sm text-fg-muted">{r.comment || "—"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
