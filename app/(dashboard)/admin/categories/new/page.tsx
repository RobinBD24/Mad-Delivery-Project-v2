import type { Metadata } from "next";

import { AdminCategoryForm } from "@/components/admin/admin-category-form";
import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getAdminCategorySummary } from "@/lib/services/page-summaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.createCategory") };
}

/**
 * /admin/categories/new — dedicated create page.
 *
 * The form used to sit in a column beside the category table. It now has its
 * own route so the list page is purely a list, and the form gets full width on
 * every breakpoint. The form component, its fields, validation and the action
 * it posts to are unchanged — only where it is rendered moved.
 */
export default async function NewCategoryPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  const [branches, summary] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getAdminCategorySummary(),
  ]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        breadcrumbs={[
          { label: t("adminExtras.categoriesTitle"), href: "/admin/categories" },
          { label: t("adminExtras.createCategory") },
        ]}
        title={t("adminExtras.createCategory")}
        subtitle={t("adminExtras.categoriesSub")}
        actions={
          <ButtonLink href="/admin/categories" variant="outline">
            {t("common.back")}
          </ButtonLink>
        }
      />

      {/* Context, not decoration: how many categories already exist and how many
          branches this new one could be scoped to. */}
      <SummaryCardGrid>
        <SummaryCard
          title={t("adminExtras.allCategories")}
          value={fmt.num(summary.total)}
          icon={<Icon name="grid" />}
        />
        <SummaryCard
          title={t("adminExtras.mainBranchGlobal")}
          value={fmt.num(summary.global)}
          icon={<Icon name="store" />}
          accent="info"
        />
        <SummaryCard
          title={t("branches.title")}
          value={fmt.num(branches.length)}
          icon={<Icon name="store" />}
          accent="neutral"
        />
      </SummaryCardGrid>

      <Card className="max-w-2xl">
        <CardContent>
          <AdminCategoryForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
