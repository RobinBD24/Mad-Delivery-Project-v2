import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BmDutyChats } from "@/components/branch/bm-duty-chats";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { RiderProfile } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.ridersTitle") };
}

/** /branch-manager/riders — riders assigned to this manager's own branch. */
export default async function BranchRidersPage() {
  const { t } = await getT();
  const me = await requireRole("branch_manager");
  const riders = await getJSON<RiderProfile[]>("/riders/branch/").catch(() => [] as RiderProfile[]);

  return (
    <>
      <PageHeader title={t("pages.ridersTitle")} subtitle={t("pages.ridersSub")} />
      <Card className="mb-6">
        <CardHeader title={t("rider.onlineRiders")} />
        <CardContent>
          <BmDutyChats viewerId={Number(me.id)} />
        </CardContent>
      </Card>
      <Card>
        {riders.length === 0 ? (
          <EmptyState title={t("pages.noRiders")} />
        ) : (
          <Table headers={[t("pages.colRider"), t("common.phone"), t("pages.colVehicle"), t("pages.colBranch")]}>
            {riders.map((r) => (
              <tr key={r.id} className="hover:bg-surface-hover/70">
                <Td>
                  <span className="flex items-center gap-2.5">
                    <UserAvatar name={r.rider_name || r.rider_username} photo={null} className="size-8 text-xs" />
                    <span className="font-medium text-fg-base">{r.rider_name || r.rider_username}</span>
                  </span>
                </Td>
                <Td>{r.rider_phone || "—"}</Td>
                <Td>{r.vehicle_type || "—"}</Td>
                <Td>{r.assigned_branch_name ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
