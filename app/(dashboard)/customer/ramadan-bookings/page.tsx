import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RamadanBookingPanel } from "@/components/customer/ramadan-booking-panel";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("ramadan.title") };
}

/** /customer/ramadan-bookings — Ramadan booking flow + my bookings. */
export default async function CustomerRamadanPage() {
  const { t } = await getT();
  await requireRole("customer");
  // Branches that have Ramadan booking enabled.
  const configs = await prisma.ramadanConfig.findMany({
    where: { isEnabled: true, branch: { isActive: true } },
    include: { branch: true },
    orderBy: { branch: { name: "asc" } },
  });
  const branches = configs.map((c) => ({ id: c.branchId, name: c.branch.name }));

  return (
    <>
      <PageHeader title={t("ramadan.title")} subtitle={t("ramadan.book")} />
      <Card>
        <CardContent className="py-6">
          {branches.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("errors.ramadan.notEnabled")}</p>
          ) : (
            <RamadanBookingPanel branches={branches} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
