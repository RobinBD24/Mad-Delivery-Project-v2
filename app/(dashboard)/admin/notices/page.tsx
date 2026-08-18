import type { Metadata } from "next";

import { NoticesView } from "@/components/notices/notices-view";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("notices.title") };
}

/** Super admin notices board: compose + broadcast + manage. */
export default async function Page() {
  await requireRole("super_admin");
  return <NoticesView canCompose canDelete />;
}
