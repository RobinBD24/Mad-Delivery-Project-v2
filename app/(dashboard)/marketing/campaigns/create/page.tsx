import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignForm } from "@/components/marketing/marketing-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.newCampaign") };
}

/** /marketing/campaigns/create — dedicated create page. */
export default async function CreateCampaignPage() {
  const { t } = await getT();
  await requireRole("marketing", "super_admin");
  const coupons = await getJSON<Paginated<{ id: number; code: string }>>("/marketing/coupons/");

  return (
    <>
      <PageHeader
        title={t("marketingX.newCampaign")}
        subtitle={t("marketingX.campaignsSub")}
        breadcrumbs={[
          { label: t("marketingX.campaignsTitle"), href: "/marketing/campaigns" },
          { label: t("marketingX.newCampaign") },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <CampaignForm initial={null} coupons={coupons.results.map((c) => ({ id: c.id, code: c.code }))} />
        </CardContent>
      </Card>
    </>
  );
}
