import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { DeliveryAreaExplorer } from "@/components/delivery/delivery-area-explorer";
import { Icon } from "@/components/layout/icons";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/current-user";
import {
  deliveryAreaQueryParams,
  parseDeliveryAreaQuery,
} from "@/lib/delivery-areas/query";
import { getT } from "@/lib/i18n/server";
import { branchForManager } from "@/lib/selectors";
import { deliveryAreaListForUser } from "@/lib/services/delivery-areas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("deliveryArea.title") };
}

/** /branch-manager/delivery-areas — BM manages ONLY their assigned branch. */
export default async function BranchManagerDeliveryAreasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getT();
  await requireRole("branch_manager");
  const me = (await getSessionUser())!;
  const query = parseDeliveryAreaQuery(await searchParams);
  const [initial, branch] = await Promise.all([
    deliveryAreaListForUser(me, query),
    branchForManager(me.id),
  ]);
  const initialQuery = deliveryAreaQueryParams({
    ...query,
    page: initial.page,
    pageSize: initial.pageSize,
  }).toString();
  return (
    <>
      <PageHeader
        title={t("deliveryArea.title")}
        subtitle={t("deliveryArea.subtitleBm")}
        action={
          <ButtonLink
            href="/branch-manager/delivery-areas/new"
            className="w-full sm:w-auto"
          >
            <Icon name="plus" className="size-4" />
            {t("deliveryArea.addDeliveryArea")}
          </ButtonLink>
        }
      />
      <DeliveryAreaExplorer
        initial={initial}
        initialQuery={initialQuery}
        isSuperAdmin={false}
        assignedBranchName={branch?.name}
        listPath="/branch-manager/delivery-areas"
      />
    </>
  );
}
