import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ComplaintForm } from "@/components/complaints/complaint-form";
import { getJSON } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("complaints.new") };
}

/** Dedicated "file a complaint" page — available to every authenticated role. */
export default async function NewComplaintPage() {
  const { t } = await getT();
  await requireUser();

  let orders: { id: number; branch: number; label: string }[] = [];
  try {
    const data = await getJSON<Paginated<Order>>("/orders/?page_size=50");
    orders = data.results.map((o) => ({
      id: o.id,
      branch: o.branch,
      label: `#${o.id} · ${o.branch_name} · ${t(`orderStatus.${o.status}`)}`,
    }));
  } catch {
    orders = [];
  }

  return (
    <>
      <PageHeader
        title={t("complaints.new")}
        subtitle={t("complaints.newSub")}
        breadcrumbs={[
          { label: t("nav.complaints") },
          { label: t("complaints.new") },
        ]}
      />
      <Card className="max-w-2xl">
        <CardContent>
          <ComplaintForm orders={orders} />
        </CardContent>
      </Card>
    </>
  );
}
