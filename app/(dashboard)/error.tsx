"use client";

import { Button } from "@/components/ui/button";
import { DashboardErrorState } from "@/components/dashboard/dashboard-states";
import { useTranslation } from "@/lib/i18n/use-translation";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DashboardErrorState
      title={t("errors.somethingWentWrong")}
      description={t("errors.dataLoadFailed")}
      reference={error.digest ? t("errors.reference", { reference: error.digest }) : undefined}
      action={<Button onClick={reset}>{t("errors.tryAgain")}</Button>}
    />
  );
}
