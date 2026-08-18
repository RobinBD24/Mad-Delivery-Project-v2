import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RamadanManagePanel } from "@/components/branch/ramadan-manage-panel";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("ramadan.title") };
}

/** /branch-manager/ramadan-bookings — Ramadan config, slots, platters, reservations. */
export default async function BranchRamadanPage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  return (
    <>
      <PageHeader title={t("ramadan.title")} subtitle={t("ramadan.configTitle")} />
      <Card>
        <CardContent className="py-6">
          <RamadanManagePanel />
        </CardContent>
      </Card>
    </>
  );
}
