import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LogoSettings } from "@/components/admin/logo-settings";
import { requireRole } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/services/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.settingsTitle") };
}

/** /admin/settings — account, security and rider-commission shortcuts. */
export default async function AdminSettingsPage() {
  const { t } = await getT();
  await requireRole("super_admin");
  const logoUrl = await getCompanyLogoUrl();

  return (
    <>
      <PageHeader title={t("pages.settingsTitle")} subtitle={t("pages.settingsSub")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("pages.account")} />
          <CardContent className="space-y-2">
            <ButtonLink href="/profile" variant="outline" className="w-full">
              <Icon name="user" className="size-4" /> {t("nav.profile")}
            </ButtonLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("pages.security")} />
          <CardContent className="space-y-2">
            <ButtonLink href="/change-password" variant="outline" className="w-full">
              <Icon name="lock" className="size-4" /> {t("profile.changePassword")}
            </ButtonLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("wallet.feeTitle")} />
          <CardContent className="space-y-2">
            <ButtonLink href="/admin/settings/delivery-fees" variant="outline" className="w-full">
              <Icon name="money" className="size-4" /> {t("wallet.setRate")}
            </ButtonLink>
          </CardContent>
        </Card>
        {/* req #3 — single global company logo, super admin only. */}
        <Card className="lg:col-span-3">
          <CardHeader title={t("logo.title")} subtitle={t("logo.subtitle")} />
          <CardContent>
            <LogoSettings initialUrl={logoUrl} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
