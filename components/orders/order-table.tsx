import Link from "next/link";

import { ResponsiveDataView } from "@/components/dashboard/responsive-data-view";
import { OrderStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getT } from "@/lib/i18n/server";
import type { Order } from "@/types";

/**
 * Reusable order list table; `hrefBase` decides the detail-page prefix per role.
 * Pass `hrefBase={null}` for read-only monitoring lists (admin/management/accounts)
 * that have no per-order detail route — the id renders as plain text, no dead link.
 */
export async function OrderTable({
  orders,
  hrefBase,
  showCustomer = true,
  showBranch = false,
}: {
  orders: Order[];
  hrefBase: string | null;
  showCustomer?: boolean;
  showBranch?: boolean;
}) {
  const { t, fmt } = await getT();

  if (orders.length === 0) {
    return <EmptyState title={t("orders.noOrders")} description={t("orders.noOrdersDesc")} />;
  }

  const headers = [
    t("orders.order"),
    ...(showCustomer ? [t("orders.customer")] : []),
    ...(showBranch ? [t("orders.branch")] : []),
    t("common.status"),
    t("orders.payment"),
    t("common.total"),
    t("orders.time"),
  ];

  const orderLabel = (order: Order) => order.order_number ?? `#${fmt.num(order.id)}`;

  return (
    <ResponsiveDataView
      items={orders}
      getKey={(order) => order.id}
      desktop={(items) => (
        <Table headers={headers}>
          {items.map((order) => (
            <tr key={order.id} className="hover:bg-surface-hover/70">
              <Td mono>
                {hrefBase ? (
                  <Link href={`${hrefBase}/${order.id}`} className="font-semibold text-brand-500 hover:underline">
                    {orderLabel(order)}
                  </Link>
                ) : (
                  <span className="font-semibold text-brand-500">{orderLabel(order)}</span>
                )}
              </Td>
              {showCustomer ? (
                <Td>
                  <span className="font-medium text-fg-base">{order.customer_name || "—"}</span>
                  <span className="block text-xs text-fg-subtle">{order.customer_phone}</span>
                </Td>
              ) : null}
              {showBranch ? <Td>{order.branch_name}</Td> : null}
              <Td><OrderStatusBadge status={order.status} /></Td>
              <Td className="whitespace-nowrap">{t(`payment.${order.payment_method}`)}</Td>
              <Td mono><span className="font-semibold">{fmt.money(order.total_amount)}</span></Td>
              <Td mono className="whitespace-nowrap">
                <span className="text-xs text-fg-muted">{fmt.dateTime(order.created_at)}</span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      mobile={(order) => (
        <article
          data-testid="mobile-order-card"
          className="rounded-2xl border border-border-base bg-surface-card p-4 shadow-[var(--dashboard-shadow-panel)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {hrefBase ? (
                <Link
                  href={`${hrefBase}/${order.id}`}
                  className="break-all font-mono text-sm font-bold text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {orderLabel(order)}
                </Link>
              ) : (
                <p className="break-all font-mono text-sm font-bold text-brand-600">{orderLabel(order)}</p>
              )}
              <p className="mt-1 font-mono text-xs text-fg-subtle">{fmt.dateTime(order.created_at)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          {showCustomer || showBranch ? (
            <div className="mt-4 grid gap-3 border-t border-border-base/70 pt-3 sm:grid-cols-2">
              {showCustomer ? (
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-semibold text-fg-subtle">{t("orders.customer")}</p>
                  <p className="mt-1 break-words text-sm font-medium text-fg-base">{order.customer_name || "—"}</p>
                  {order.customer_phone ? <p className="mt-0.5 text-xs text-fg-muted">{order.customer_phone}</p> : null}
                </div>
              ) : null}
              {showBranch ? (
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-semibold text-fg-subtle">{t("orders.branch")}</p>
                  <p className="mt-1 break-words text-sm font-medium text-fg-base">{order.branch_name || "—"}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border-base/70 pt-3">
            <div>
              <p className="text-[0.6875rem] font-semibold text-fg-subtle">{t("orders.payment")}</p>
              <p className="mt-1 text-sm text-fg-muted">{t(`payment.${order.payment_method}`)}</p>
            </div>
            <div className="text-right">
              <p className="text-[0.6875rem] font-semibold text-fg-subtle">{t("common.total")}</p>
              <p className="mt-1 font-mono text-base font-bold text-fg-base">{fmt.money(order.total_amount)}</p>
            </div>
          </div>
        </article>
      )}
    />
  );
}
