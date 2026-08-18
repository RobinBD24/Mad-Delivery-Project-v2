import type { Metadata } from "next";

import { UserForm } from "@/components/dashboard/users/user-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.createUserTitle") };
}

/** /admin/users/create — super admin creates any staff/customer user. */
export default async function CreateUserPage() {
  await requireRole("super_admin");
  const { t } = await getT();

  return (
    <>
      <PageHeader
        title={t("users.createUserTitle")}
        subtitle={t("users.createUserSubtitle")}
        breadcrumbs={[
          { label: t("users.allUsers"), href: "/admin/users" },
          { label: t("users.createUserTitle") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardContent className="py-6">
          <UserForm />
        </CardContent>
      </Card>
    </>
  );
}
