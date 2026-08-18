"use client";

import { Icon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Print/save-as-PDF via the browser print dialog (no external PDF service). */
export function PrintButton() {
  const { t } = useTranslation();
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <Icon name="list" className="size-4" /> {t("financials.printInvoice")}
    </Button>
  );
}
