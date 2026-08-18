import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { CampaignDeleteButton } from "@/components/marketing/marketing-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.campaignsTitle") };
}

interface CampaignT {
  id: number;
  title: string;
  type: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  coupon_code: string | null;
}

/** /marketing/campaigns — campaign list with create/edit/delete. */
export default async function MarketingCampaignsPage() {
  const { t, fmt } = await getT();
  await requireRole("marketing", "super_admin");
  const data = await getJSON<Paginated<CampaignT>>("/marketing/campaigns/");

  return (
    <>
      <PageHeader
        title={t("pages.campaignsTitle")}
        subtitle={t("marketingX.campaignsSub")}
        action={
          <ButtonLink href="/marketing/campaigns/create">
            <Icon name="plus" className="size-4" /> {t("marketingX.newCampaign")}
          </ButtonLink>
        }
      />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState
            title={t("marketingX.noCampaigns")}
            description={t("marketingX.noCampaignsDesc")}
            action={<ButtonLink href="/marketing/campaigns/create" size="sm">{t("marketingX.newCampaign")}</ButtonLink>}
          />
        ) : (
          <Table headers={[t("marketingX.campaignTitle"), t("marketingX.typeLabel"), t("marketingX.couponLabel"), t("marketingX.periodLabel"), t("pages.colStatus"), t("pages.colActions")]}>
            {data.results.map((c) => (
              <tr key={c.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{c.title}</span></Td>
                <Td>{t(`marketingX.type_${c.type}`)}</Td>
                <Td>{c.coupon_code ?? "—"}</Td>
                <Td><span className="text-xs text-fg-muted">{fmt.date(c.starts_at)} – {fmt.date(c.ends_at)}</span></Td>
                <Td>
                  <Badge tone={c.is_active ? "green" : "slate"}>
                    {c.is_active ? t("marketingX.active") : t("marketingX.inactive")}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <span className="flex items-center justify-end gap-2">
                    <Link href={`/marketing/campaigns/${c.id}/edit`} className="text-sm font-medium text-fg-muted hover:text-brand-600 hover:underline">
                      {t("common.edit")}
                    </Link>
                    <CampaignDeleteButton campaignId={c.id} />
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
