import type { Metadata } from "next";

import { NotificationsView } from "@/components/notifications/notifications-view";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("notifications.title") };
}

export default async function Page() {
  await requireRole("rider");
  return <NotificationsView />;
}
