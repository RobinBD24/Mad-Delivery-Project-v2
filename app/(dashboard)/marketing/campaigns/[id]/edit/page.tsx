import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignForm, type CampaignInitial } from "@/components/marketing/marketing-forms";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.editCampaign") };
}

type Params = { params: Promise<{ id: string }> };

/** /marketing/campaigns/[id]/edit — dedicated edit page. */
export default async function EditCampaignPage({ params }: Params) {
  const { t } = await getT();
  await requireRole("marketing", "super_admin");
  const { id } = await params;

  let campaign: CampaignInitial;
  try {
    campaign = await getJSON<CampaignInitial>(`/marketing/campaigns/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const coupons = await getJSON<Paginated<{ id: number; code: string }>>("/marketing/coupons/");

  return (
    <>
      <PageHeader
        title={t("marketingX.editCampaign")}
        subtitle={campaign.title}
        breadcrumbs={[
          { label: t("marketingX.campaignsTitle"), href: "/marketing/campaigns" },
          { label: campaign.title },
          { label: t("common.edit") },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <CampaignForm initial={campaign} coupons={coupons.results.map((c) => ({ id: c.id, code: c.code }))} />
        </CardContent>
      </Card>
    </>
  );
}
