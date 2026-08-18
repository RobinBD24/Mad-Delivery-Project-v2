import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ReservationStatusBadge } from "@/components/branch/reservation-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("bmExtras.reservationsTitle") };
}

interface ReservationT {
  id: number;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  requested_at: string;
  status: string;
}

/** /branch-manager/table-reservations — incoming reservation requests. */
export default async function BranchReservationsPage() {
  const { t, fmt } = await getT();
  await requireRole("branch_manager");
  const data = await getJSON<Paginated<ReservationT>>("/reservations/?page_size=100");

  return (
    <>
      <PageHeader title={t("bmExtras.reservationsTitle")} subtitle={t("bmExtras.reservationsSub")} />
      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("bmExtras.noReservations")} description={t("bmExtras.noReservationsDesc")} />
        ) : (
          <Table headers={[t("bmExtras.guestName"), t("bmExtras.guestPhone"), t("bmExtras.partySize"), t("bmExtras.dateTime"), t("pages.colStatus"), ""]}>
            {data.results.map((r) => (
              <tr key={r.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{r.guest_name}</span></Td>
                <Td>{r.guest_phone}</Td>
                <Td>{fmt.num(r.party_size)}</Td>
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(r.requested_at)}</span></Td>
                <Td><ReservationStatusBadge status={r.status} /></Td>
                <Td className="text-right">
                  <Link href={`/branch-manager/table-reservations/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {t("bmExtras.manage")}
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
