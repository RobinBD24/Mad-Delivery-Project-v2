import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { UserAvatar } from "@/components/common/user-avatar";
import { ApproveRejectButtons } from "@/components/dashboard/approve-reject-buttons";
import { UserAdminActions } from "@/components/dashboard/users/user-admin-actions";
import { PageHeader } from "@/components/layout/page-header";
import { AssignRiderBranchForm } from "@/components/riders/assign-rider-branch-form";
import { RoleBadge, UserAccountStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/utils";
import type { Branch, Paginated, RiderProfile, User } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.details") };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg-base">{value || "—"}</span>
    </div>
  );
}

function DocImage({ label, src }: { label: string; src: string | null }) {
  const url = mediaUrl(src);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <p className="mb-1 text-xs font-medium text-fg-muted">{label}</p>
      <Image src={url} alt={label} width={200} height={130} className="h-32 w-full rounded-xl border border-border-base object-cover" />
    </a>
  );
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const { id } = await params;

  let user: User;
  try {
    user = await getJSON<User>(`/auth/users/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let riderProfile: RiderProfile | null = null;
  let branches: Branch[] = [];
  if (user.role === "rider") {
    const [profiles, branchList] = await Promise.all([
      getJSON<Paginated<RiderProfile>>(`/rider-profiles/?search=${user.username}`),
      getJSON<Paginated<Branch>>("/branches/?is_active=true&page_size=100"),
    ]);
    riderProfile = profiles.results.find((p) => p.user === user.id) ?? null;
    branches = branchList.results;
  }

  return (
    <>
      <PageHeader
        title={user.full_name || user.username}
        subtitle={`@${user.username}`}
        breadcrumbs={[
          { label: t("users.allUsers"), href: "/admin/users" },
          { label: user.full_name || user.username },
        ]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {user.status === "pending" ? <ApproveRejectButtons userId={user.id} /> : null}
            <ButtonLink href={`/admin/users/${user.id}/edit`} variant="outline" size="sm">
              {t("common.edit")}
            </ButtonLink>
            <UserAdminActions userId={user.id} isActive={user.is_active} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center py-8 text-center">
            <UserAvatar
              name={user.full_name || user.username}
              photo={user.profile_photo}
              version={user.updated_at}
              className="size-24 text-3xl font-bold"
            />
            <h2 className="mt-3 text-lg font-semibold text-fg-base">{user.full_name || user.username}</h2>
            <div className="mt-2 flex gap-2">
              <RoleBadge role={user.role} />
              <UserAccountStatusBadge
                status={user.status}
                isBlocked={user.is_blocked}
              />
            </div>
            {user.status === "rejected" && user.rejection_reason ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {t("users.reasonLabel")}: {user.rejection_reason}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("users.generalInfo")} />
          <CardContent className="divide-y divide-border-base">
            <InfoRow label={t("common.email")} value={user.email} />
            <InfoRow label={t("common.phone")} value={user.phone} />
            <InfoRow label={t("common.address")} value={user.address} />
            <InfoRow label={t("users.dateOfBirth")} value={user.date_of_birth ? fmt.date(user.date_of_birth) : "—"} />
            <InfoRow label={t("users.joined")} value={fmt.dateTime(user.date_joined)} />
            <InfoRow
              label={t("users.approval")}
              value={
                user.approved_at
                  ? `${fmt.dateTime(user.approved_at)}${user.approved_by_name ? ` — ${user.approved_by_name}` : ""}`
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      {user.role === "rider" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={t("users.riderInfoDocs")} />
            <CardContent>
              {riderProfile ? (
                <>
                  <div className="grid gap-x-8 sm:grid-cols-2">
                    <InfoRow label={t("users.nidNumber")} value={riderProfile.nid_number} />
                    <InfoRow label={t("users.vehicle")} value={riderProfile.vehicle_type} />
                    <InfoRow label={t("users.license")} value={riderProfile.driving_license_number} />
                    <InfoRow label={t("users.bikeReg")} value={riderProfile.bike_registration_number} />
                    <InfoRow label={t("users.bloodGroup")} value={riderProfile.blood_group} />
                    <InfoRow label={t("users.education")} value={riderProfile.education} />
                    <InfoRow
                      label={t("users.emergencyContact")}
                      value={`${riderProfile.emergency_contact_name} ${riderProfile.emergency_contact_phone}`.trim()}
                    />
                    <InfoRow label={t("users.assignedBranch")} value={riderProfile.assigned_branch_name ?? "—"} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DocImage label={t("users.nidFront")} src={riderProfile.nid_front_image} />
                    <DocImage label={t("users.nidBack")} src={riderProfile.nid_back_image} />
                    <DocImage label={t("users.license")} src={riderProfile.license_image} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg-muted">{t("users.noRiderProfile")}</p>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader title={t("users.branchAssignment")} subtitle={t("users.riderHomeOutlet")} />
            <CardContent>
              <AssignRiderBranchForm
                riderUserId={user.id}
                currentBranchId={riderProfile?.assigned_branch ?? null}
                branches={branches.map((b) => ({ id: b.id, name: b.name }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
