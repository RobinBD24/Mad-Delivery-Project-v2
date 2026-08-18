import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssignManagerForm } from "@/components/branches/assign-manager-form";
import { BranchActions } from "@/components/branches/branch-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Branch, ManagerAssignment, Paginated, User } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("branches.branchInfo") };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg-base">{value || "—"}</span>
    </div>
  );
}

export default async function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin");
  const { t, fmt } = await getT();
  const { id } = await params;

  let branch: Branch;
  try {
    branch = await getJSON<Branch>(`/branches/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [managers, history] = await Promise.all([
    getJSON<Paginated<User>>("/auth/users/?role=branch_manager&status=approved&page_size=100"),
    getJSON<Paginated<ManagerAssignment>>(`/manager-assignments/?branch=${id}`),
  ]);

  return (
    <>
      <PageHeader
        title={branch.name}
        subtitle={branch.address}
        breadcrumbs={[
          { label: t("pages.branchesTitle"), href: "/admin/branches" },
          { label: branch.name },
        ]}
        action={
          <span className="flex items-center gap-2">
            <ButtonLink href={`/admin/branches/${branch.id}/edit`} variant="outline">
              {t("common.edit")}
            </ButtonLink>
            <BranchActions branchId={branch.id} branchName={branch.name} isActive={branch.is_active ?? true} />
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("branches.branchInfo")}
            action={branch.is_active ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="red">{t("common.inactive")}</Badge>}
          />
          <CardContent className="grid gap-x-8 sm:grid-cols-2">
            <InfoRow label={t("branches.brandType")} value={t(`brands.${branch.brand_type ?? "combined"}`)} />
            <InfoRow label={t("common.phone")} value={branch.phone} />
            <InfoRow label={t("common.email")} value={branch.email} />
            <InfoRow label={t("branches.bkashNumber")} value={branch.bkash_number} />
            <InfoRow label={t("branches.deliveryRadius")} value={`${fmt.num(branch.delivery_radius_km)} ${t("branches.km")}`} />
            <InfoRow label={t("branches.openLabel")} value={branch.opening_time ?? "—"} />
            <InfoRow label={t("branches.closeLabel")} value={branch.closing_time ?? "—"} />
            <InfoRow
              label={t("branches.location")}
              value={branch.latitude && branch.longitude ? `${branch.latitude}, ${branch.longitude}` : "—"}
            />
            <InfoRow label={t("branches.currentManager")} value={branch.manager_name ?? t("common.notAssigned")} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader title={t("branches.assignManager")} subtitle={t("branches.assignManagerHint")} />
          <CardContent>
            <AssignManagerForm
              branchId={branch.id}
              currentManagerId={branch.manager ?? null}
              managers={managers.results.map((m) => ({
                id: m.id,
                name: m.full_name || m.username,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("branches.rotationHistory")} />
        {history.results.length === 0 ? (
          <EmptyState title={t("branches.noHistory")} />
        ) : (
          <Table headers={[t("branches.manager"), t("branches.start"), t("branches.end"), t("branches.duration"), t("branches.note")]}>
            {history.results.map((a) => (
              <tr key={a.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{a.manager_name || a.manager_username}</span></Td>
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(a.assigned_at)}</span></Td>
                <Td><span className="text-xs text-fg-muted">{a.relieved_at ? fmt.dateTime(a.relieved_at) : t("branches.ongoing")}</span></Td>
                <Td>{fmt.num(a.duration_days)} {t("branches.days")}</Td>
                <Td><span className="text-xs">{a.notes || "—"}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
