import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReservationStatusBadge, ReservationThread } from "@/components/branch/reservation-forms";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

interface ReservationDetailT {
  id: number;
  branch_name: string;
  customer_name: string;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  requested_at: string;
  status: string;
  note: string;
  messages?: {
    id: number;
    sender: number;
    sender_name: string;
    sender_role: string;
    body: string;
    created_at: string;
  }[];
}

/** Shared reservation detail (chat + manage), for BM and customer. */
export async function ReservationDetailView({ id, backHref, canManage }: { id: string; backHref: string; canManage: boolean }) {
  const { t, fmt } = await getT();
  const me = await requireUser();

  let r: ReservationDetailT;
  try {
    r = await getJSON<ReservationDetailT>(`/reservations/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={r.guest_name}
        subtitle={`${r.branch_name} · ${fmt.dateTime(r.requested_at)}`}
        breadcrumbs={[
          {
            label: canManage ? t("bmExtras.reservationsTitle") : t("bmExtras.myReservations"),
            href: backHref,
          },
          { label: r.guest_name },
        ]}
        action={<ReservationStatusBadge status={r.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={t("bmExtras.conversation")} />
            <CardContent>
              <ReservationThread
                reservationId={r.id}
                viewerId={Number(me.id)}
                guestPhone={r.guest_phone}
                status={r.status}
                messages={r.messages ?? []}
                canManage={canManage}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title={t("bmExtras.details")} />
          <CardContent className="space-y-2.5 text-sm">
            <Row label={t("bmExtras.guestName")} value={r.guest_name} />
            <Row label={t("bmExtras.guestPhone")} value={r.guest_phone} />
            <Row label={t("bmExtras.partySize")} value={fmt.num(r.party_size)} />
            <Row label={t("bmExtras.dateTime")} value={fmt.dateTime(r.requested_at)} />
            {r.note ? <Row label={t("bmExtras.noteLabel")} value={r.note} /> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg-base">{value}</span>
    </div>
  );
}
