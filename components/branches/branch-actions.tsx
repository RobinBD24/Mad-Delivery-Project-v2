"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { ActionState, BranchDeleteState } from "@/lib/api/action-state";
import { deleteBranchAction, setBranchActiveAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Super Admin: activate/deactivate + delete controls on a branch (req #1).
 * The delete dialog names the EXACT branch and warns that a branch carrying any
 * operational/historical data is ARCHIVED rather than permanently removed — the
 * server decides, `deleteBranchAction` RETURNS the real outcome, and this sends
 * the user back to the list with `?result=deleted|archived` so it states what
 * actually happened. (Leaving the detail page is required for a hard delete:
 * the branch no longer exists.)
 */
export function BranchActions({
  branchId,
  branchName,
  isActive,
}: {
  branchId: number;
  branchName: string;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      const result = await setBranchActiveAction(branchId, !isActive);
      setError(result.error);
    });
  }

  function handleDeleted(state: ActionState) {
    const result = (state as BranchDeleteState).result ?? "deleted";
    router.replace(`/admin/branches?result=${result}`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button
        size="sm"
        variant={isActive ? "outline" : "success"}
        onClick={toggleActive}
        disabled={pending}
        data-testid="branch-toggle-active"
      >
        {isActive ? t("branches.deactivate") : t("branches.activate")}
      </Button>
      <ConfirmModal
        trigger={
          <Button size="sm" variant="outline" className="text-red-600" data-testid="branch-delete">
            {t("common.delete")}
          </Button>
        }
        title={t("branches.deleteTitle")}
        description={`${t("branches.deleteNamed", { name: branchName })} ${t("branches.deleteArchiveWarning")}`}
        confirmLabel={t("branches.confirmDelete")}
        action={async () => deleteBranchAction(branchId)}
        onDone={handleDeleted}
      />
    </div>
  );
}
