import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeliveryAreaForm } from "@/components/delivery/delivery-area-form";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { ApiError } from "@/lib/http/errors";
import { areaForManage, serializeArea } from "@/lib/services/delivery-areas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("deliveryArea.editTitle") };
}

export default async function AdminEditDeliveryAreaPage({
  params,
  searchParams,
}: PageProps<"/admin/delivery-areas/[id]/edit">) {
  await requireRole("super_admin");
  const me = (await getSessionUser())!;
  const { id } = await params;
  const query = await searchParams;
  const areaId = Number(id);
  if (!Number.isSafeInteger(areaId) || areaId < 1) notFound();
  let area: Awaited<ReturnType<typeof areaForManage>>;
  try {
    area = await areaForManage(me, areaId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  return (
    <DeliveryAreaForm
      mode="edit"
      listPath="/admin/delivery-areas"
      isSuperAdmin
      initial={serializeArea(area)}
      returnTo={typeof query.returnTo === "string" ? query.returnTo : undefined}
    />
  );
}
