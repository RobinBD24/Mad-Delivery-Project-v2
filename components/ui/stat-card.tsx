import type { ReactNode } from "react";

import { SummaryCard, type SummaryAccent } from "@/components/dashboard/summary-card";

const ACCENT_MAP: Record<"brand" | "green" | "amber" | "blue" | "violet" | "red" | "slate", SummaryAccent> = {
  brand: "brand",
  green: "success",
  amber: "warning",
  blue: "info",
  violet: "violet",
  red: "danger",
  slate: "neutral",
};

export function StatCard({
  label,
  value,
  icon,
  accent = "brand",
  sub,
  /** 0–100; renders the mockup's .kpi-bar when set. */
  progress,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: keyof typeof ACCENT_MAP;
  sub?: string;
  progress?: number;
}) {
  return (
    <SummaryCard
      title={label}
      value={value}
      icon={icon}
      accent={ACCENT_MAP[accent]}
      description={sub}
      progress={progress}
    />
  );
}
