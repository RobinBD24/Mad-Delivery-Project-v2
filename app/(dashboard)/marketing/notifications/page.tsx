import type { Metadata } from "next";

import { NotificationsView } from "@/components/notifications/notifications-view";
import { NoticesView } from "@/components/notices/notices-view";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("notifications.title") };
}

/** Marketing: personal inbox + a composer to send marketing broadcasts. */
export default async function Page() {
  await requireRole("marketing");
  return (
    <div className="space-y-8">
      <NoticesView canCompose />
      <NotificationsView />
    </div>
  );
}
