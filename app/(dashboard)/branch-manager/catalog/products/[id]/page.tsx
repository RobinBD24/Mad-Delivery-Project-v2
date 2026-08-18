import type { Metadata } from "next";

import { ProductDetailView } from "@/components/catalog/product-detail-view";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { productForManage } from "@/lib/services/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.title") };
}

/**
 * /branch-manager/catalog/products/[id] — dedicated Product View.
 * `productForManage` enforces the OWN-BRANCH restriction server-side, so a
 * manager cannot open another branch's product by guessing its id. Hold and
 * delete are super-admin-only and are therefore not offered here (and are
 * refused by the API regardless).
 */
export default async function BranchManagerProductViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("branch_manager");
  // productForManage works on the Prisma row (it re-reads branch scope), so the
  // session record is fetched rather than the serialized session user.
  const me = (await getSessionUser())!;
  const { t } = await getT();
  const { id } = await params;
  const product = await productForManage(me, Number(id));
  return (
    <ProductDetailView
      productId={product.id}
      basePath="/branch-manager/catalog/products"
      backLabel={t("catalog.title")}
    />
  );
}
