"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { decideWithdrawalAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { RiderWithdrawalT } from "@/types";

/**
 * Accounts-side actions on one withdrawal row:
 * pending → Approve / Reject(reason) · approved → Mark Paid / Reject(reason).
 *
 * Reject and Mark Paid both move the withdrawal into a TERMINAL state (this
 * component renders nothing once a row is rejected or paid), so each is
 * confirmed in a dialog that names the exact withdrawal. Reject keeps its
 * mandatory reason, now validated inside the dialog so the message appears
 * next to the field instead of under the row.
 */
export function WithdrawalActions({ withdrawal }: { withdrawal: RiderWithdrawalT }) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  /** Runs the decision and reports failure back into the open dialog. */
  function decide(decision: "approve" | "reject" | "pay", reason: string) {
    return new Promise<{ error: string | null }>((resolve) => {
      start(async () => {
        const res = await decideWithdrawalAction(withdrawal.id, decision, reason.trim());
        if (res.error) {
          resolve({ error: res.error });
          return;
        }
        router.refresh();
        resolve({ error: null });
      });
    });
  }

  if (withdrawal.status === "rejected" || withdrawal.status === "paid") return null;

  const amount = fmt.money(withdrawal.amount);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {withdrawal.status === "pending" ? (
          <Button size="sm" variant="success" disabled={pending} onClick={() => void decide("approve", "")}>
            {t("wallet.approve")}
          </Button>
        ) : (
          <ConfirmModal
            trigger={
              <Button size="sm" variant="success" disabled={pending}>
                {t("wallet.markPaid")}
              </Button>
            }
            title={t("wallet.markPaidTitle")}
            description={t("wallet.markPaidDesc", { amount })}
            confirmLabel={t("wallet.markPaid")}
            action={async () => decide("pay", "")}
          />
        )}

        <ConfirmModal
          trigger={
            <Button size="sm" variant="danger" disabled={pending}>
              {t("wallet.reject")}
            </Button>
          }
          title={t("wallet.rejectTitle")}
          description={t("wallet.rejectDesc", { amount })}
          confirmLabel={t("wallet.confirmReject")}
          withReason
          reasonPlaceholder={t("wallet.reasonPlaceholder")}
          action={async (reason) => {
            // The workflow already requires a reason — keep that rule, and let
            // the dialog surface it beside the field the user must fill.
            if (!reason.trim()) return { error: t("wallet.errReason") };
            return decide("reject", reason);
          }}
        />
      </div>
    </div>
  );
}
