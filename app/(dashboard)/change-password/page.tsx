import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PasswordForm } from "@/components/forms/password-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("profile.changePassword") };
}

export default async function ChangePasswordPage() {
  // Gate access to authenticated, approved users (redirects otherwise).
  await requireUser();
  const { t } = await getT();

  return (
    <>
      <PageHeader
        title={t("profile.changePassword")}
        subtitle={t("profile.changePasswordPageSub")}
      />
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader title={t("profile.updatePassword")} />
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </>
  );
}
