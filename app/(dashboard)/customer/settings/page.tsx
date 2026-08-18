import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NotificationsToggle } from "@/components/customer/notifications-toggle";
import { DeleteAccountCard } from "@/components/customer/delete-account-card";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("settings.title") };
}

const HELPLINE = "09638-050505";

/** /customer/settings — notification toggle + account shortcuts + helpline. */
export default async function CustomerSettingsPage() {
  const { t } = await getT();
  const me = await requireRole("customer");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: Number(me.id) },
    select: { notificationsEnabled: true },
  });

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("settings.preferences")} />
          <CardContent>
            <NotificationsToggle initial={user.notificationsEnabled} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("pages.account")} />
          <CardContent className="space-y-2">
            <ButtonLink href="/profile" variant="outline" className="w-full">
              <Icon name="user" className="size-4" /> {t("nav.profile")}
            </ButtonLink>
            <ButtonLink href="/change-password" variant="outline" className="w-full">
              <Icon name="lock" className="size-4" /> {t("profile.changePassword")}
            </ButtonLink>
            <ButtonLink href="/customer/addresses" variant="outline" className="w-full">
              <Icon name="pin" className="size-4" /> {t("nav.addresses")}
            </ButtonLink>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("settings.helpline")} />
          <CardContent>
            <a
              href={`tel:${HELPLINE.replace(/-/g, "")}`}
              className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 hover:bg-brand-100"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                <Icon name="phone" />
              </span>
              <span className="text-lg font-bold text-fg-base">{HELPLINE}</span>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("pages.account")} />
          <CardContent>
            <DeleteAccountCard />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
