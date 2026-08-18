"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { setRewardProgramActiveAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * PHASE G — Super Admin switch for the whole reward programme.
 *
 * Pausing is confirmed (it changes customer-facing behaviour); activating applies
 * directly, consistent with the other list toggles. RBAC is enforced server-side
 * — hiding this control is never the protection. Repeating the current state
 * returns 409 from the API, so a double-submit cannot look like a real change.
 * Pausing stops FUTURE earning/redemption only: balances and ledger history are
 * preserved and become usable again on re-activation.
 */
export function RewardProgramToggle({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function activate() {
    setError(null);
    start(async () => {
      const res = await setRewardProgramActiveAction(true);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="reward-program-toggle">
      <span className="text-sm font-medium text-fg-base">{t("rewards.programStatus")}</span>
      {/* Badge does not forward arbitrary props, so the test hook lives on a wrapper. */}
      {active ? (
        <span data-testid="reward-status-active"><Badge tone="green">{t("rewards.active")}</Badge></span>
      ) : (
        <span data-testid="reward-status-paused"><Badge tone="red">{t("rewards.paused")}</Badge></span>
      )}

      {active ? (
        <ConfirmModal
          trigger={
            <button type="button" className="text-sm font-medium text-red-600 hover:underline" data-testid="reward-deactivate">
              {t("rewards.deactivate")}
            </button>
          }
          title={t("rewards.confirmDeactivateTitle")}
          description={t("rewards.confirmDeactivateDesc")}
          confirmLabel={t("rewards.confirmDeactivate")}
          action={async () => setRewardProgramActiveAction(false)}
        />
      ) : (
        <Button size="sm" variant="success" onClick={activate} disabled={pending} data-testid="reward-activate">
          {t("rewards.activate")}
        </Button>
      )}

      {!active ? (
        <p className="w-full text-xs text-amber-600 dark:text-amber-400" data-testid="reward-paused-notice">
          {t("rewards.pausedNotice")}
        </p>
      ) : null}
      {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
