import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { SegmentForm, SegmentRowActions } from "@/components/marketing/marketing-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketingX.audienceTitle") };
}

interface SegmentT {
  id: number;
  name: string;
  criteria: string;
  size: number;
}

function describeCriteria(raw: string, labels: { location: string; minOrders: string; recent: string }): string {
  try {
    const c = JSON.parse(raw) as { location?: string; min_orders?: number; days_since_last_order?: number };
    const parts: string[] = [];
    if (c.location) parts.push(`${labels.location}: ${c.location}`);
    if (c.min_orders) parts.push(`${labels.minOrders}: ${c.min_orders}`);
    if (c.days_since_last_order) parts.push(`${labels.recent}: ${c.days_since_last_order}d`);
    return parts.join(" · ") || "—";
  } catch {
    return "—";
  }
}

/** /marketing/audience — audience segmentation + targeted notification send. */
export default async function MarketingAudiencePage() {
  const { t, fmt } = await getT();
  await requireRole("marketing", "super_admin");
  const data = await getJSON<Paginated<SegmentT>>("/marketing/segments/");

  const labels = {
    location: t("marketingX.locationLabel"),
    minOrders: t("marketingX.minOrdersLabel"),
    recent: t("marketingX.recentDaysLabel"),
  };

  return (
    <>
      <PageHeader title={t("marketingX.audienceTitle")} subtitle={t("marketingX.audienceSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("marketingX.createSegment")} subtitle={t("marketingX.segmentHint")} />
          <CardContent>
            <SegmentForm />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("marketingX.segments")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("marketingX.noSegments")} description={t("marketingX.noSegmentsDesc")} />
          ) : (
            <Table headers={[t("marketingX.segmentNameLabel"), t("marketingX.criteriaLabel"), t("marketingX.audienceSize"), t("pages.colActions")]}>
              {data.results.map((s) => (
                <tr key={s.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{s.name}</span></Td>
                  <Td><span className="text-xs text-fg-muted">{describeCriteria(s.criteria, labels)}</span></Td>
                  <Td><span className="font-semibold">{fmt.num(s.size)}</span></Td>
                  <Td className="text-right"><SegmentRowActions segmentId={s.id} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
