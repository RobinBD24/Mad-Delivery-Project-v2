"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { WithdrawalStatus } from "@/types";

const TONES = {
  pending: "amber",
  approved: "blue",
  rejected: "red",
  paid: "green",
} as const;

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  const { t } = useTranslation();
  return <Badge tone={TONES[status]}>{t(`withdrawalStatus.${status}`)}</Badge>;
}
