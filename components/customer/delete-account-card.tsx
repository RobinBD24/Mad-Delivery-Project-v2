"use client";

import { Icon } from "@/components/layout/icons";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { deleteAccountAction } from "@/lib/auth/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Danger-zone "Delete My Account" control for the customer settings page. */
export function DeleteAccountCard() {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
          <Icon name="trash" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-700">{t("settings.deleteAccount")}</p>
          <p className="mt-0.5 text-sm text-red-600/80">{t("settings.deleteAccountDesc")}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <ConfirmModal
          trigger={
            <button
              type="button"
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("settings.deleteAccount")}
            </button>
          }
          title={t("settings.deleteAccountTitle")}
          description={t("settings.deleteAccountConfirm")}
          confirmLabel={t("settings.deleteAccount")}
          action={async () => {
            // Redirects to /login on success; only returns here on error.
            return deleteAccountAction();
          }}
        />
      </div>
    </div>
  );
}
