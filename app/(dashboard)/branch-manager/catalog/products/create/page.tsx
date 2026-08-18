import type { Metadata } from "next";

import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { branchForManager, categoriesForUser } from "@/lib/selectors";
import { serializeCategory } from "@/lib/serializers";
import type { Category } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.newProduct") };
}

export default async function ProductCreatePage() {
  await requireRole("branch_manager");
  const { t } = await getT();
  // Query selectors directly — no HTTP self-fetch (avoids the prod host/cookie
  // fragility that surfaced the "Data could not be loaded" boundary).
  const me = (await getSessionUser())!;
  const branch = await branchForManager(me.id);
  const categories = (await categoriesForUser(me)).map(serializeCategory) as Category[];

  return (
    <>
      <PageHeader
        title={t("catalog.newProduct")}
        subtitle={t("catalog.newProductSubtitle")}
        breadcrumbs={[
          { label: t("nav.catalog"), href: "/branch-manager/catalog" },
          { label: t("catalog.newProduct") },
        ]}
      />
      <ProductForm
        categories={categories}
        basePath="/branch-manager/catalog"
        categoryCreateHref="/branch-manager/catalog/categories/create"
        fixedBranch={branch ? { id: branch.id, name: branch.name, brand_type: branch.brandType } : undefined}
      />
    </>
  );
}
