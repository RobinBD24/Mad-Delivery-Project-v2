import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BranchForm } from "@/components/branches/branch-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Branch } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("branches.editTitle") };
}

export default async function BranchEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin");
  const { t } = await getT();
  const { id } = await params;

  let branch: Branch;
  try {
    branch = await getJSON<Branch>(`/branches/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={t("branches.editTitle", { name: branch.name })}
        breadcrumbs={[
          { label: t("pages.branchesTitle"), href: "/admin/branches" },
          { label: branch.name, href: `/admin/branches/${branch.id}` },
          { label: t("common.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardContent className="py-6">
          <BranchForm branch={branch} />
        </CardContent>
      </Card>
    </>
  );
}
