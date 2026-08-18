import type { Metadata } from "next";

import { DeliveryAreaForm } from "@/components/delivery/delivery-area-form";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("deliveryArea.addTitle") };
}

export default async function AdminNewDeliveryAreaPage() {
  await requireRole("super_admin");
  await getSessionUser();
  const branches = await prisma.branch.findMany({
    where: { isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <DeliveryAreaForm
      mode="create"
      listPath="/admin/delivery-areas"
      isSuperAdmin
      branches={branches}
    />
  );
}
