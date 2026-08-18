import Image from "next/image";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { ProductRowActions } from "@/components/catalog/product-row-actions";
import { Icon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { isProductOrderable } from "@/lib/services/product-eligibility";
import { mediaUrl } from "@/lib/utils";

/**
 * The dedicated Product VIEW page, shared by /admin/products/[id] and
 * /branch-manager/catalog/products/[id]. Neither section had one — a product
 * could only be opened in an edit form, so there was no way to inspect a product
 * (or its live customer visibility) without entering an editing context.
 *
 * The caller has already authorized access via `productForManage`, which is what
 * enforces the branch-manager's own-branch restriction.
 */
export async function ProductDetailView({
  productId,
  basePath,
  backLabel,
  canHold = false,
  canDelete = false,
}: {
  productId: number;
  /** Section base, e.g. "/admin/products". */
  basePath: string;
  backLabel: string;
  canHold?: boolean;
  canDelete?: boolean;
}) {
  const { t, fmt } = await getT();
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
  });

  // The same predicate every customer surface uses, so this page reports the
  // product's REAL public visibility rather than a second opinion about it.
  const orderable = isProductOrderable(product);
  const image = mediaUrl(product.image, product.updatedAt.toISOString());

  const statusBadge = product.deletedAt ? (
    <Badge tone="slate">{t("catalog.deletedBadge")}</Badge>
  ) : product.heldByAdmin ? (
    <Badge tone="red">{t("adminExtras.heldBadge")}</Badge>
  ) : product.isAvailable ? (
    <Badge tone="green">{t("adminExtras.availableBadge")}</Badge>
  ) : (
    <Badge tone="amber">{t("adminExtras.deactivatedBadge")}</Badge>
  );

  const rows: [string, string][] = [
    [t("pages.colBranch"), product.branch.name],
    [t("catalog.brand"), product.brand ? t(`brands.${product.brand}`) : "—"],
    [t("adminExtras.colCategory"), product.category?.name ?? "—"],
    [t("variationType.label"), t(`variationType.${product.variationType}`)],
    // `catalog.minutes` is the bare unit ("min"), not a templated sentence.
    [t("catalog.prepTime"), `${fmt.num(product.preparationTime)} ${t("catalog.minutes")}`],
    [t("catalog.discount"), `${fmt.num(Number(product.discount))}%`],
    [t("catalog.popular"), product.isPopular ? t("common.yes") : t("common.no")],
    [t("catalog.recommended"), product.isRecommended ? t("common.yes") : t("common.no")],
    [t("catalog.lastUpdated"), fmt.dateTime(product.updatedAt.toISOString())],
  ];

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        breadcrumbs={[{ label: backLabel, href: basePath }, { label: product.name }]}
        title={product.name}
        subtitle={product.description || undefined}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`${basePath}/${product.id}/edit`}>{t("common.edit")}</ButtonLink>
            <ProductRowActions
              productId={product.id}
              productName={product.name}
              branchName={product.branch.name}
              isAvailable={product.isAvailable}
              heldByAdmin={product.heldByAdmin}
              basePath={basePath}
              canHold={canHold}
              canDelete={canDelete}
            />
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-muted">
              {image ? (
                <Image
                  src={image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-fg-subtle">
                  <Icon name="grid" className="size-10" />
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {statusBadge}
              {/* The single honest answer to "can a customer order this right
                  now?", computed by the shared eligibility predicate. */}
              <Badge tone={orderable ? "green" : "slate"}>
                {orderable ? t("catalog.visibleToCustomers") : t("catalog.hiddenFromCustomers")}
              </Badge>
            </div>
            {product.deactivationReason ? (
              <p className="mt-3 text-sm text-fg-muted">
                <span className="font-medium text-fg-base">{t("catalog.reasonLabel")}: </span>
                {product.deactivationReason}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border-base pb-2">
                  <dt className="text-xs text-fg-muted">{label}</dt>
                  <dd className="text-sm font-medium text-fg-base">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold text-fg-base">{t("catalog.variations")}</h2>
          <Table
            headers={[
              t("catalog.variationName"),
              t("adminExtras.colPrice"),
              t("catalog.servingInfo"),
              t("pages.colStatus"),
            ]}
          >
            {product.variations.map((v) => (
              <tr key={v.id} className="hover:bg-surface-hover/70">
                <Td>
                  <span className="font-medium text-fg-base">{v.name}</span>
                  {v.isDefault ? (
                    <span className="ml-2 text-xs text-fg-muted">{t("catalog.defaultVariation")}</span>
                  ) : null}
                </Td>
                <Td>{fmt.money(v.price.toString())}</Td>
                <Td>{v.servingInfo || v.sizeLabel || "—"}</Td>
                <Td>
                  {v.isEnabled ? (
                    <Badge tone="green">{t("common.enabled")}</Badge>
                  ) : (
                    <Badge tone="slate">{t("common.disabled")}</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
