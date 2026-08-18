import type { Metadata } from "next";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/forms/profile-form";
import { Icon } from "@/components/layout/icons";
import { RoleBadge, UserStatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("profile.myProfile") };
}

export default async function ProfilePage() {
  const user = await requireUser();
  const { t } = await getT();

  return (
    <>
      <PageHeader
        title={t("profile.myProfile")}
        subtitle={`@${user.username}`}
        action={
          <span className="flex gap-2">
            <RoleBadge role={user.role} />
            <UserStatusBadge status={user.status} />
          </span>
        }
      />
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader
          title={t("profile.personalInfo")}
          action={
            <Link
              href="/change-password"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Icon name="lock" className="size-4" />
              {t("profile.changePassword")}
            </Link>
          }
        />
        <CardContent>
          <ProfileForm user={user} />
        </CardContent>
      </Card>
    </>
  );
}
