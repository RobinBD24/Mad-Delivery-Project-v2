import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserForm } from "@/components/dashboard/users/user-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { User } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.editUser") };
}

/** /admin/users/[id]/edit — edit a user's profile + role. */
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin");
  const { t } = await getT();
  const { id } = await params;

  let user: User;
  try {
    user = await getJSON<User>(`/auth/users/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        title={t("users.editUser")}
        subtitle={`@${user.username}`}
        breadcrumbs={[
          { label: t("users.allUsers"), href: "/admin/users" },
          { label: user.full_name || user.username, href: `/admin/users/${user.id}` },
          { label: t("common.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardContent className="py-6">
          <UserForm user={user} />
        </CardContent>
      </Card>
    </>
  );
}
