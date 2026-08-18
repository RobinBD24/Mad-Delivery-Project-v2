"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { blockCustomerAction, unblockCustomerAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Block (with required reason) / unblock a customer — super admin. */
export function CustomerBlockButton({ userId, isBlocked }: { userId: number; isBlocked: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    if (isBlocked) {
      start(async () => {
        const res = await unblockCustomerAction(userId);
        if (res.error) setError(res.error);
        router.refresh();
      });
      return;
    }
    if (!asking) {
      setAsking(true);
      return;
    }
    if (!reason.trim()) {
      setError(t("adminExtras.errBlockReason"));
      return;
    }
    start(async () => {
      const res = await blockCustomerAction(userId, reason.trim());
      if (res.error) return setError(res.error);
      setAsking(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {asking && !isBlocked ? (
          <input
            autoFocus
            className="w-44 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            placeholder={t("adminExtras.blockReasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        <Button size="sm" variant={isBlocked ? "success" : "danger"} disabled={pending} onClick={run}>
          {isBlocked ? t("adminExtras.unblock") : t("adminExtras.block")}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
