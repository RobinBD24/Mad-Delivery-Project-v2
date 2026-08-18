import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RamadanSummary } from "@/components/management/ramadan-summary";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("ramadan.summary") };
}

/** /management/ramadan — read-only Ramadan summaries (real DB metrics). */
export default async function ManagementRamadanPage() {
  const { t } = await getT();
  await requireRole("management");
  return (
    <>
      <PageHeader title={t("ramadan.summary")} subtitle={t("ramadan.reservations")} />
      <Card>
        <CardContent className="py-6">
          <RamadanSummary />
        </CardContent>
      </Card>
    </>
  );
}
