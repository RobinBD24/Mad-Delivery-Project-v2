import type { Metadata } from "next";

import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { categoriesForUser } from "@/lib/selectors";
import { serializeCategory } from "@/lib/serializers";
import type { Category } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.newProduct") };
}

/** /admin/products/create — Super Admin creates a product for ANY branch. */
export default async function AdminProductCreatePage() {
  await requireRole("super_admin");
  const { t } = await getT();
  const me = (await getSessionUser())!;

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, brandType: true },
  });
  const categories = (await categoriesForUser(me)).map(serializeCategory) as Category[];

  return (
    <>
      <PageHeader
        title={t("catalog.newProduct")}
        subtitle={t("catalog.newProductSubtitle")}
        breadcrumbs={[
          { label: t("pages.productsTitle"), href: "/admin/products" },
          { label: t("catalog.newProduct") },
        ]}
      />
      {branches.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              title={t("catalog.noBranchesYet")}
              action={<ButtonLink href="/admin/branches/create">{t("catalog.createBranchLink")}</ButtonLink>}
            />
          </CardContent>
        </Card>
      ) : (
        <ProductForm
          categories={categories}
          basePath="/admin/products"
          categoryCreateHref="/admin/categories"
          branches={branches.map((b) => ({ id: b.id, name: b.name, brand_type: b.brandType }))}
        />
      )}
    </>
  );
}
