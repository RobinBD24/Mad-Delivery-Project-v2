import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated, Product } from "@/types";

export const metadata: Metadata = { title: "Products" };

/** /marketing/products — read-only catalog of products across active branches. */
export default async function MarketingProductsPage() {
  await requireRole("marketing");
  const { t, fmt } = await getT();
  const data = await getJSON<Paginated<Product>>("/products/?page_size=100");

  return (
    <>
      <PageHeader title={t("pages.productsTitle")} subtitle={t("pages.productsSub")} />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table headers={[t("pages.colProduct"), t("pages.colBranch"), t("pages.colCategory"), t("pages.price"), t("common.status")]}>
            {data.results.map((p) => (
              <tr key={p.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{p.name}</span></Td>
                <Td>{p.branch_name}</Td>
                <Td>{p.category_name ?? "—"}</Td>
                <Td><span className="font-semibold">{fmt.money(p.price)}</span></Td>
                <Td>
                  {p.is_available ? (
                    <Badge tone="green">{t("pages.available")}</Badge>
                  ) : (
                    <Badge tone="red">{t("pages.unavailable")}</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
