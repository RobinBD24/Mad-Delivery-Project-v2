import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ComplaintStatusBadge } from "@/components/complaints/complaint-status-badge";
import { ComplaintThread } from "@/components/complaints/complaint-thread";
import { ApiError, getJSON } from "@/lib/api/client";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import type { Complaint, ComplaintStatus } from "@/types";

/** Shared complaint detail (thread + status controls), reachable at /complaints/[id]. */
export async function ComplaintDetailView({ id }: { id: string }) {
  const { t, fmt } = await getT();
  const me = await requireUser();

  let complaint: Complaint;
  try {
    complaint = await getJSON<Complaint>(`/complaints/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  const canHandle =
    me.role === "super_admin" ||
    (me.role === complaint.recipient_role && Number(me.id) !== complaint.complainant);

  const backHref = `${me.role === "super_admin" ? "/admin" : `/${me.role.replace(/_/g, "-")}`}/complaints`;

  return (
    <>
      <PageHeader
        title={complaint.subject}
        subtitle={`${t("complaints.toLabel")}: ${t(`roles.${complaint.recipient_role}`)}`}
        breadcrumbs={[
          { label: t("nav.complaints"), href: backHref },
          { label: complaint.subject },
        ]}
        action={<ComplaintStatusBadge status={complaint.status as ComplaintStatus} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={t("complaints.conversation")} />
            <CardContent>
              <ComplaintThread complaint={complaint} viewerId={Number(me.id)} canHandle={canHandle} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader title={t("complaints.details")} />
            <CardContent className="space-y-3 text-sm">
              <Row label={t("complaints.category")} value={t(`complaintCategory.${complaint.category}`)} />
              <Row label={t("complaints.recipient")} value={t(`roles.${complaint.recipient_role}`)} />
              <Row label={t("complaints.from")} value={complaint.complainant_name} />
              {complaint.branch_name ? <Row label={t("complaints.branchLabel")} value={complaint.branch_name} /> : null}
              {complaint.order ? (
                <Row label={t("complaints.relatedOrder")} value={`#${fmt.num(complaint.order)}`} />
              ) : null}
              <Row label={t("complaints.filedOn")} value={fmt.dateTime(complaint.created_at)} />
              {complaint.assigned_to_name ? (
                <Row label={t("complaints.handledBy")} value={complaint.assigned_to_name} />
              ) : null}
            </CardContent>
          </Card>
        </div>
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
