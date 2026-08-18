import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { branchForManager, categoriesForUser } from "@/lib/selectors";
import { serializeCategory, serializeProduct } from "@/lib/serializers";
import type { Category, Product } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.editProductTitle") };
}

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("branch_manager");
  const { t } = await getT();
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId <= 0) notFound();
  const me = (await getSessionUser())!;
  const branch = await branchForManager(me.id);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
  });
  // Own-branch scope: a BM may only edit products in their assigned branch.
  if (!product || !branch || product.branchId !== branch.id) notFound();

  const categories = (await categoriesForUser(me)).map(serializeCategory) as Category[];

  return (
    <>
      <PageHeader
        title={t("catalog.editProductTitle", { name: product.name })}
        breadcrumbs={[
          { label: t("nav.catalog"), href: "/branch-manager/catalog" },
          { label: product.name },
          { label: t("common.edit") },
        ]}
      />
      <ProductForm
        product={serializeProduct(product) as Product}
        categories={categories}
        basePath="/branch-manager/catalog"
        categoryCreateHref="/branch-manager/catalog/categories/create"
        fixedBranch={{ id: branch.id, name: branch.name, brand_type: branch.brandType }}
      />
    </>
  );
}
