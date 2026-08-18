"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Spinner } from "@/components/ui/spinner";
import { deleteUserAction, setUserActiveAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Super Admin: activate/deactivate + delete a user (delete asks for confirmation). */
export function UserAdminActions({ userId, isActive }: { userId: number; isActive: boolean }) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      const result = await setUserActiveAction(userId, !isActive);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button size="sm" variant="outline" onClick={toggleActive} disabled={pending}>
        {pending ? <Spinner className="size-3.5 border-border-strong border-t-slate-600" /> : null}
        {isActive ? t("users.deactivate") : t("users.activate")}
      </Button>
      <ConfirmModal
        trigger={
          <Button size="sm" variant="outline" className="text-red-600">
            {t("common.delete")}
          </Button>
        }
        title={t("users.deleteTitle")}
        description={t("users.deleteDesc")}
        confirmLabel={t("users.confirmDelete")}
        action={() => deleteUserAction(userId)}
      />
    </div>
  );
}
