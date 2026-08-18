import type { Metadata } from "next";

import { ProductDetailView } from "@/components/catalog/product-detail-view";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { productForManage } from "@/lib/services/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.productsTitle") };
}

/** /admin/products/[id] — dedicated Product View (super admin, any branch). */
export default async function AdminProductViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("super_admin");
  // productForManage works on the Prisma row (it re-reads branch scope), so the
  // session record is fetched rather than the serialized session user.
  const me = (await getSessionUser())!;
  const { t } = await getT();
  const { id } = await params;
  // Authorization + existence in one call; throws 404/403 rather than rendering.
  const product = await productForManage(me, Number(id));
  return (
    <ProductDetailView
      productId={product.id}
      basePath="/admin/products"
      backLabel={t("adminExtras.productsTitle")}
      canHold
      canDelete
    />
  );
}
