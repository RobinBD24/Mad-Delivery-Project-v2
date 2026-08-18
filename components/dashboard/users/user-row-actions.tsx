"use client";

import Link from "next/link";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { deleteUserAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { Role } from "@/types";

/**
 * Inline per-row actions for the Super Admin user list: View, Edit and Delete.
 * Delete is hidden for super admins (the API rejects it) and asks for
 * confirmation before running.
 */
export function UserRowActions({ userId, role }: { userId: number; role: Role }) {
  const { t } = useTranslation();
  const link = "inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-start gap-1 md:justify-end">
      <Link href={`/admin/users/${userId}`} className={link}>
        {t("common.view")}
      </Link>
      <Link href={`/admin/users/${userId}/edit`} className={link}>
        {t("common.edit")}
      </Link>
      {role !== "super_admin" ? (
        <ConfirmModal
          trigger={
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-500/10"
            >
              {t("common.delete")}
            </button>
          }
          title={t("users.deleteTitle")}
          description={t("users.deleteDesc")}
          confirmLabel={t("users.confirmDelete")}
          action={() => deleteUserAction(userId)}
        />
      ) : null}
    </div>
  );
}
