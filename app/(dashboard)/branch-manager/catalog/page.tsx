import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ProductRowActions } from "@/components/catalog/product-row-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { cn, mediaUrl } from "@/lib/utils";
import type { Category, Paginated, Product } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("catalog.title") };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; search?: string }>;
}) {
  await requireRole("branch_manager");
  const { t, fmt } = await getT();
  const params = await searchParams;

  const productQuery = new URLSearchParams({ page_size: "100" });
  if (params.cat) productQuery.set("category", params.cat);
  if (params.search) productQuery.set("search", params.search);

  const [categories, products] = await Promise.all([
    getJSON<Paginated<Category>>("/categories/?page_size=100"),
    getJSON<Paginated<Product>>(`/products/?${productQuery.toString()}`),
  ]);

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-brand-500 text-white" : "bg-surface-card text-fg-muted ring-1 ring-slate-200 hover:bg-surface-hover",
    );

  return (
    <>
      <PageHeader
        title={t("catalog.title")}
        subtitle={t("catalog.subtitle")}
        action={
          <span className="flex gap-2">
            {/* Categories are created by the super admin only; managers add products under them. */}
            <ButtonLink href="/branch-manager/catalog/products/create">+ {t("catalog.product")}</ButtonLink>
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/branch-manager/catalog" className={chip(!params.cat)}>
          {t("common.all")} ({fmt.num(products.count)})
        </Link>
        {categories.results.map((cat) => (
          <span key={cat.id} className={chip(params.cat === String(cat.id))}>
            {/* Categories are managed by the super admin only (req #7) — a branch
                manager can filter by them but never edit or delete them. */}
            <Link href={`/branch-manager/catalog?cat=${cat.id}`}>
              {cat.name} ({fmt.num(cat.product_count)})
            </Link>
          </span>
        ))}
      </div>

      <form className="mb-4" action="/branch-manager/catalog" method="get" noValidate>
        {params.cat ? <input type="hidden" name="cat" value={params.cat} /> : null}
        <input
          name="search"
          defaultValue={params.search}
          placeholder={t("catalog.searchProduct")}
          className="w-full max-w-md rounded-xl border border-border-strong bg-surface-card px-4 py-2.5 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/20"
        />
      </form>

      <Card>
        <CardHeader title={`${t("catalog.product")} (${fmt.num(products.count)})`} />
        {products.results.length === 0 ? (
          <EmptyState
            title={t("catalog.noProducts")}
            description={t("catalog.noProductsDesc")}
            action={<ButtonLink href="/branch-manager/catalog/products/create">{t("catalog.addProduct")}</ButtonLink>}
          />
        ) : (
          <Table headers={[t("catalog.product"), t("catalog.category"), t("common.price"), t("common.status"), ""]}>
            {products.results.map((product) => {
              const image = mediaUrl(product.image);
              const hasDiscount = Number(product.discount) > 0;
              return (
                <tr key={product.id} className="hover:bg-surface-hover/70">
                  <Td>
                    <span className="flex items-center gap-3">
                      {image ? (
                        <Image src={image} alt="" width={44} height={44} className="size-11 rounded-xl object-cover" />
                      ) : (
                        <span className="flex size-11 items-center justify-center rounded-xl bg-surface-muted text-lg">🍛</span>
                      )}
                      <span>
                        <span className="flex items-center gap-2 font-medium text-fg-base">
                          {product.name}
                          {product.is_popular ? <Badge tone="brand">{t("catalog.popular")}</Badge> : null}
                          {product.is_recommended ? <Badge tone="violet">{t("catalog.recommended")}</Badge> : null}
                        </span>
                        <span className="block text-xs text-fg-subtle">⏱ {fmt.num(product.preparation_time)} {t("catalog.minutes")}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>{product.category_name ?? "—"}</Td>
                  <Td>
                    <span className="font-semibold">{fmt.money(product.discounted_price)}</span>
                    {hasDiscount ? (
                      <span className="block text-xs text-fg-subtle line-through">{fmt.money(product.price)}</span>
                    ) : null}
                  </Td>
                  <Td>
                    {product.is_available ? <Badge tone="green">{t("catalog.available")}</Badge> : <Badge tone="red">{t("catalog.unavailable")}</Badge>}
                  </Td>
                  <Td>
                    {/* Same compact action menu + confirmation modals the admin
                        list uses. Hold and delete are super-admin-only, so they
                        are not offered here and the API refuses them anyway. */}
                    <ProductRowActions
                      productId={product.id}
                      productName={product.name}
                      branchName={product.branch_name}
                      isAvailable={product.is_available}
                      heldByAdmin={product.held_by_admin}
                      basePath="/branch-manager/catalog/products"
                    />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
