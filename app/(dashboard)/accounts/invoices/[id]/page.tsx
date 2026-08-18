import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/accounts/print-button";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("financials.invoicesTitle") };
}

type Params = { params: Promise<{ id: string }> };

/** /accounts/invoices/[id] — printable invoice (browser print = PDF download). */
export default async function InvoicePage({ params }: Params) {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      branch: true,
      items: { include: { product: true } },
      refunds: true,
    },
  });
  if (!order) notFound();

  const refunded = order.refunds.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <PageHeader
        title={`INV-${String(order.id).padStart(5, "0")}`}
        subtitle={t("financials.invoiceFor", { id: fmt.num(order.id) })}
        breadcrumbs={[
          { label: t("financials.invoicesTitle"), href: "/accounts/invoices" },
          { label: `INV-${String(order.id).padStart(5, "0")}` },
        ]}
        action={<PrintButton />}
      />
      <Card className="max-w-3xl print:border-0 print:shadow-none">
        <CardContent className="space-y-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-fg-base">MAD Delivery</p>
              <p className="text-sm text-fg-muted">{order.branch.name}</p>
              <p className="text-sm text-fg-muted">{order.branch.address}</p>
              <p className="text-sm text-fg-muted">{order.branch.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-fg-muted">{t("financials.billedTo")}</p>
              <p className="font-semibold text-fg-base">
                {`${order.customer.firstName} ${order.customer.lastName}`.trim() || order.customer.username}
              </p>
              <p className="text-sm text-fg-muted">{order.customer.phone}</p>
              <p className="max-w-56 text-sm text-fg-muted">{order.deliveryAddress}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-1 rounded-xl bg-surface-muted px-4 py-3 text-sm">
            <span>
              <span className="text-fg-muted">{t("financials.invoiceNo")}: </span>
              <span className="font-semibold">INV-{String(order.id).padStart(5, "0")}</span>
            </span>
            <span>
              <span className="text-fg-muted">{t("pages.colDate")}: </span>
              <span className="font-semibold">{fmt.dateTime(order.createdAt.toISOString())}</span>
            </span>
            <span>
              <span className="text-fg-muted">{t("pages.colMethod")}: </span>
              <span className="font-semibold">{t(`payment.${order.paymentMethod}`)}</span>
            </span>
            <span>
              <span className="text-fg-muted">{t("pages.colStatus")}: </span>
              <span className="font-semibold">{t(`orderStatus.${order.status}`)}</span>
            </span>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-base text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-2">{t("adminExtras.colProduct")}</th>
                <th className="py-2 text-right">{t("financials.qty")}</th>
                <th className="py-2 text-right">{t("financials.unitPrice")}</th>
                <th className="py-2 text-right">{t("financials.lineTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2.5 font-medium text-fg-base">{i.product?.name ?? `#${i.productId}`}</td>
                  <td className="py-2.5 text-right">{fmt.num(i.quantity)}</td>
                  <td className="py-2.5 text-right">{fmt.money(i.unitPrice.toString())}</td>
                  <td className="py-2.5 text-right font-semibold">
                    {fmt.money(Number(i.unitPrice) * i.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto w-56 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">{t("financials.subtotal")}</span>
              <span className="font-semibold">{fmt.money(order.totalAmount.toString())}</span>
            </div>
            {refunded > 0 ? (
              <div className="flex justify-between text-red-600">
                <span>{t("financials.refunded")}</span>
                <span>-{fmt.money(refunded)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border-base pt-1.5 text-base font-bold text-fg-base">
              <span>{t("financials.total")}</span>
              <span>{fmt.money(Number(order.totalAmount) - refunded)}</span>
            </div>
          </div>

          <p className="text-center text-xs text-fg-subtle">{t("financials.invoiceFooter")}</p>
        </CardContent>
      </Card>
    </>
  );
}
