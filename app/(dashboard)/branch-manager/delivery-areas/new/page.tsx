import type { Metadata } from "next";

import { DeliveryAreaForm } from "@/components/delivery/delivery-area-form";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { branchForManager } from "@/lib/selectors";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("deliveryArea.addTitle") };
}

export default async function BranchManagerNewDeliveryAreaPage() {
  await requireRole("branch_manager");
  const me = (await getSessionUser())!;
  const branch = await branchForManager(me.id);

  return (
    <DeliveryAreaForm
      mode="create"
      listPath="/branch-manager/delivery-areas"
      isSuperAdmin={false}
      assignedBranch={branch ? { id: branch.id, name: branch.name } : null}
    />
  );
}
