import type { ReactNode } from "react";

import {
  DashboardPageHeader,
  type DashboardBreadcrumb,
} from "@/components/dashboard/dashboard-page";

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumbs,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  breadcrumbs?: DashboardBreadcrumb[];
  eyebrow?: string;
}) {
  return (
    <DashboardPageHeader
      title={title}
      subtitle={subtitle}
      actions={action}
      breadcrumbs={breadcrumbs}
      eyebrow={eyebrow}
    />
  );
}
