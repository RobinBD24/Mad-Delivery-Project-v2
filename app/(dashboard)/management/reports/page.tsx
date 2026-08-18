import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { MANAGEMENT_REPORTS } from "@/lib/services/management";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.reportsTitle") };
}

const ICONS: Record<string, string> = {
  sales: "money",
  orders: "bag",
  branches: "store",
  riders: "bike",
  customers: "users",
  products: "grid",
  finance: "chart",
  complaints: "inbox",
  marketing: "megaphone",
  delivery: "pin",
  attendance: "clock",
};

/** /management/reports — hub linking to every report + exports. */
export default async function ManagementReportsHub() {
  const { t } = await getT();
  await requireRole("management", "super_admin");

  return (
    <>
      <PageHeader
        title={t("pages.reportsTitle")}
        subtitle={t("mgmtReports.hubSub")}
        action={
          <Link
            href="/management/exports"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border-strong bg-surface-card px-4 text-sm font-medium text-fg-base hover:bg-surface-hover"
          >
            <Icon name="list" className="size-4" /> {t("mgmtReports.allExports")}
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MANAGEMENT_REPORTS.map((type) => (
          <Link key={type} href={`/management/reports/${type}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={ICONS[type] ?? "chart"} />
                </span>
                <span>
                  <span className="block font-semibold text-fg-base">{t(`mgmtReports.title.${type}`)}</span>
                  <span className="block text-xs text-fg-muted">{t(`mgmtReports.sub.${type}`)}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
