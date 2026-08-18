import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

const HOTLINE = "09638-050505";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.supportTitle") };
}

/** /customer/support — support contact + issue categories (shared with rider support). */
export default async function CustomerSupportPage() {
  const { t } = await getT();
  await requireRole("customer");

  const categories = [
    { icon: "bag", label: t("rider.issueDelivery") },
    { icon: "money", label: t("rider.issuePayment") },
    { icon: "grid", label: t("rider.issueApp") },
    { icon: "list", label: t("rider.issueOther") },
  ];

  return (
    <>
      <PageHeader title={t("pages.supportTitle")} subtitle={t("pages.supportSub")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("rider.hotline")} />
          <CardContent>
            <p className="mb-4 text-sm text-fg-muted">{t("rider.supportDesc")}</p>
            <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                <Icon name="phone" />
              </span>
              <a href={`tel:${HOTLINE.replace(/-/g, "")}`} className="text-lg font-bold text-fg-base hover:text-brand-600">
                {HOTLINE}
              </a>
            </div>
            <a
              href={`tel:${HOTLINE.replace(/-/g, "")}`}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Icon name="phone" className="size-4" /> {t("rider.callSupport")}
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("rider.issueCategories")} />
          <CardContent className="grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <div key={c.label} className="flex items-center gap-2.5 rounded-xl border border-border-base px-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-muted text-fg-muted">
                  <Icon name={c.icon} className="size-4" />
                </span>
                <span className="text-sm font-medium text-fg-base">{c.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
