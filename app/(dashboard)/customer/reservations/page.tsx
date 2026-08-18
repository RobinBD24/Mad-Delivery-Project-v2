import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ReservationRequestForm, ReservationStatusBadge } from "@/components/branch/reservation-forms";
import { getJSON } from "@/lib/api/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("bmExtras.myReservations") };
}

interface ReservationT {
  id: number;
  branch_name: string;
  party_size: number;
  requested_at: string;
  status: string;
}

/** /customer/reservations — request a table + track own reservations. */
export default async function CustomerReservationsPage() {
  const { t, fmt } = await getT();
  await requireRole("customer");
  const [data, branches] = await Promise.all([
    getJSON<Paginated<ReservationT>>("/reservations/?page_size=100"),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title={t("bmExtras.myReservations")} subtitle={t("bmExtras.myReservationsSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title={t("bmExtras.requestTable")} />
          <CardContent>
            <ReservationRequestForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("bmExtras.myReservations")} />
          {data.results.length === 0 ? (
            <EmptyState title={t("bmExtras.noMyReservations")} description={t("bmExtras.noMyReservationsDesc")} />
          ) : (
            <Table headers={[t("pages.colBranch"), t("bmExtras.partySize"), t("bmExtras.dateTime"), t("pages.colStatus"), ""]}>
              {data.results.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{r.branch_name}</span></Td>
                  <Td>{fmt.num(r.party_size)}</Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.dateTime(r.requested_at)}</span></Td>
                  <Td><ReservationStatusBadge status={r.status} /></Td>
                  <Td className="text-right">
                    <Link href={`/customer/reservations/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                      {t("common.view")}
                    </Link>
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
