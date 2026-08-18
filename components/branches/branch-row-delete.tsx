"use client";

import { useRouter } from "next/navigation";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { ActionState, BranchDeleteState } from "@/lib/api/action-state";
import { deleteBranchAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * req #1 — row-level Delete on the Super Admin branch list. Names the EXACT
 * branch and warns the operation may ARCHIVE rather than permanently delete;
 * the server decides and `deleteBranchAction` RETURNS the real outcome, which
 * is put into the URL so the list banner states "deleted" vs "archived"
 * accurately. ConfirmModal disables its confirm button while the action runs
 * (no duplicate submissions) and always tears its overlay down afterwards, so
 * the next row's Delete works immediately without a page refresh.
 */
export function BranchRowDelete({ branchId, branchName }: { branchId: number; branchName: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  function handleDone(state: ActionState) {
    const result = (state as BranchDeleteState).result ?? "deleted";
    // Reflect what actually happened, then refetch the list. `replace` keeps
    // the Back button clean; `refresh` re-runs the server component so an
    // archived row shows its new state and a deleted row disappears — even
    // when the URL is unchanged because the previous outcome was the same.
    // Scrolling is left to the shell's ScrollToTop, which brings the success
    // banner at the top of the list into view.
    router.replace(`/admin/branches?result=${result}`);
    router.refresh();
  }

  return (
    <ConfirmModal
      trigger={
        <button
          type="button"
          className="font-medium text-red-600 hover:underline"
          data-testid={`branch-row-delete-${branchId}`}
        >
          {t("common.delete")}
        </button>
      }
      title={t("branches.deleteTitle")}
      description={`${t("branches.deleteNamed", { name: branchName })} ${t("branches.deleteArchiveWarning")}`}
      confirmLabel={t("branches.confirmDelete")}
      action={async () => deleteBranchAction(branchId)}
      onDone={handleDone}
    />
  );
}
