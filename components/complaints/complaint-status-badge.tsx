"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { ComplaintStatus } from "@/types";

const TONES = {
  pending: "amber",
  in_progress: "blue",
  resolved: "green",
  closed: "slate",
} as const;

export function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const { t } = useTranslation();
  return <Badge tone={TONES[status]}>{t(`complaintStatus.${status}`)}</Badge>;
}
