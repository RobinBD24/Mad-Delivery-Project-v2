import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { categoriesForUser } from "@/lib/selectors";
import { serializeCategory, serializeProduct } from "@/lib/serializers";
import type { Category, Product } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.editProductTitle") };
}

/** /admin/products/[id]/edit — Super Admin edits any branch's product. */
export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin");
  const { t } = await getT();
  const paramsValue = await params;
  const id = Number(paramsValue.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const me = (await getSessionUser())!;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
  });
  if (!product) notFound();

  const categories = (await categoriesForUser(me)).map(serializeCategory) as Category[];

  return (
    <>
      <PageHeader
        title={t("catalog.editProductTitle", { name: product.name })}
        breadcrumbs={[
          { label: t("pages.productsTitle"), href: "/admin/products" },
          { label: product.name },
          { label: t("common.edit") },
        ]}
      />
      <ProductForm
        product={serializeProduct(product) as Product}
        categories={categories}
        basePath="/admin/products"
        categoryCreateHref="/admin/categories"
        fixedBranch={{ id: product.branch.id, name: product.branch.name, brand_type: product.branch.brandType }}
      />
    </>
  );
}
