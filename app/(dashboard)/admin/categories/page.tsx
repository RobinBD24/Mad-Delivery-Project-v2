import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { CategoryActions } from "@/components/admin/category-actions";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getAdminCategorySummary } from "@/lib/services/page-summaries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminExtras.categoriesTitle") };
}

/** /admin/categories — SA creates categories; BMs add products under them. */
export default async function AdminCategoriesPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  // The branch list is only needed by the create form, which now lives on its
  // own route — so this page no longer queries it.
  const [categories, summary] = await Promise.all([
    prisma.category.findMany({
      include: { branch: true, _count: { select: { products: true } } },
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
    }),
    getAdminCategorySummary(),
  ]);

  return (
    <>
      <PageHeader
        title={t("adminExtras.categoriesTitle")}
        subtitle={t("adminExtras.categoriesSub")}
        action={
          <ButtonLink href="/admin/categories/new">
            + {t("adminExtras.createCategory")}
          </ButtonLink>
        }
      />
      <SummaryCardGrid className="mb-5">
        <SummaryCard title={t("adminExtras.allCategories")} value={fmt.num(summary.total)} icon={<Icon name="grid" />} />
        <SummaryCard title={t("adminExtras.activeLabel")} value={fmt.num(summary.active)} icon={<Icon name="check" />} accent="success" />
        <SummaryCard title={t("adminExtras.mainBranchGlobal")} value={fmt.num(summary.global)} icon={<Icon name="store" />} accent="info" />
        <SummaryCard title={t("adminExtras.inactiveLabel")} value={fmt.num(summary.inactive)} icon={<Icon name="x" />} accent="neutral" />
      </SummaryCardGrid>

      <div className="grid gap-6">
        {/* The create form moved to its own route (/admin/categories/new) so
            this page is a list, not a list plus a form. */}
        <Card>
          <CardHeader title={t("adminExtras.allCategories")} />
          {categories.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("adminExtras.colCategory"), t("pages.colBranch"), t("adminExtras.colProducts"), t("pages.colStatus"), ""]}>
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover/70">
                  <Td>
                    <span className="font-medium text-fg-base">{c.name}</span>
                    {c.description ? <span className="block text-xs text-fg-subtle">{c.description}</span> : null}
                  </Td>
                  <Td>{c.branch?.name ?? t("adminExtras.mainBranchGlobal")}</Td>
                  <Td>{fmt.num(c._count.products)}</Td>
                  <Td>
                    <span
                      className={
                        c.isActive
                          ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200"
                          : "rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg-muted"
                      }
                    >
                      {c.isActive ? t("adminExtras.activeLabel") : t("adminExtras.inactiveLabel")}
                    </span>
                  </Td>
                  {/* req #2/#3 — delete + activate/deactivate (super-admin-only). */}
                  <Td className="text-right">
                    <CategoryActions
                      categoryId={c.id}
                      name={c.name}
                      scope={c.branch?.name ?? t("categories.scopeGlobal")}
                      isActive={c.isActive}
                      productCount={c._count.products}
                    />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
