import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-states";
import { getT } from "@/lib/i18n/server";

export default async function DashboardLoading() {
  const { t } = await getT();
  return <DashboardPageSkeleton label={t("states.loading")} />;
}
