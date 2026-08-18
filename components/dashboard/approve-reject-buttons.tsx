"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Spinner } from "@/components/ui/spinner";
import { approveUserAction, rejectUserAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Super Admin: approve / reject a pending user (reject asks for a reason). */
export function ApproveRejectButtons({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve() {
    startTransition(async () => {
      const result = await approveUserAction(userId);
      setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button size="sm" variant="success" onClick={approve} disabled={pending}>
        {pending ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : null}
        {t("common.approve")}
      </Button>
      <ConfirmModal
        trigger={
          <Button size="sm" variant="outline" className="text-red-600" disabled={pending}>
            {t("common.reject")}
          </Button>
        }
        title={t("users.rejectTitle")}
        description={t("users.rejectDesc")}
        confirmLabel={t("users.rejectConfirm")}
        withReason
        reasonPlaceholder={t("users.rejectPlaceholder")}
        action={(reason) => rejectUserAction(userId, reason)}
      />
    </div>
  );
}
