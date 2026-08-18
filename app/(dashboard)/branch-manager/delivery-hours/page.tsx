import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import {
  DeliveryHoursForm,
  TimeSlotDeleteButton,
  TimeSlotForm,
} from "@/components/branch/delivery-settings-forms";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("bmExtras.hoursTitle") };
}

interface SettingsT {
  opening_time: string | null;
  closing_time: string | null;
}
interface SlotT {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
}

/** /branch-manager/delivery-hours — opening/closing + delivery time slots. */
export default async function DeliveryHoursPage() {
  const { t } = await getT();
  await requireRole("branch_manager");
  const [settings, slots] = await Promise.all([
    getJSON<SettingsT>("/branch-manager/delivery-settings/"),
    getJSON<Paginated<SlotT>>("/branch-manager/time-slots/"),
  ]);

  return (
    <>
      <PageHeader title={t("bmExtras.hoursTitle")} subtitle={t("bmExtras.hoursSub")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title={t("bmExtras.openingHours")} />
          <CardContent>
            <DeliveryHoursForm opening={settings.opening_time} closing={settings.closing_time} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("bmExtras.timeSlots")} subtitle={t("bmExtras.timeSlotsSub")} />
          <CardContent className="space-y-4">
            <TimeSlotForm />
            {slots.results.length === 0 ? (
              <EmptyState title={t("bmExtras.noSlots")} />
            ) : (
              <Table headers={[t("bmExtras.slotLabel"), t("bmExtras.fromLabel"), t("bmExtras.toLabel"), ""]}>
                {slots.results.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-hover/70">
                    <Td><span className="font-medium text-fg-base">{s.label || "—"}</span></Td>
                    <Td>{s.start_time}</Td>
                    <Td>{s.end_time}</Td>
                    <Td className="text-right"><TimeSlotDeleteButton slotId={s.id} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
