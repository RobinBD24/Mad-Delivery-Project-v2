"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { markAttendanceAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Mark today's attendance (present/absent/leave) — any staff role. */
export function AttendanceMarker({ todayStatus }: { todayStatus: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function mark(status: string) {
    setError(null);
    setSuccess(null);
    start(async () => {
      const res = await markAttendanceAction(status, note.trim());
      if (res.error) return setError(res.error);
      setSuccess(res.success ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Alert tone="error" message={error} />
      <Alert tone="success" message={success} />
      {todayStatus ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {t("bmExtras.todayMarked", { status: t(`bmExtras.att_${todayStatus}`) })}
        </p>
      ) : (
        <p className="text-sm text-fg-muted">{t("bmExtras.notMarkedToday")}</p>
      )}
      <input
        className="w-full rounded-xl border border-border-strong px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        placeholder={t("bmExtras.attNotePlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="success" disabled={pending} onClick={() => mark("present")}>{t("bmExtras.att_present")}</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => mark("leave")}>{t("bmExtras.att_leave")}</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => mark("absent")}>{t("bmExtras.att_absent")}</Button>
      </div>
    </div>
  );
}
