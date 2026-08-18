"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/layout/icons";
import { deleteNoticeAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

export function NoticeDeleteButton({ noticeId }: { noticeId: number }) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      trigger={
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-red-600 hover:underline"
        >
          <Icon name="x" className="size-4" /> {t("common.delete")}
        </button>
      }
      title={t("notices.deleteTitle")}
      description={t("notices.deleteDesc")}
      confirmLabel={t("common.delete")}
      action={() => deleteNoticeAction(noticeId)}
    />
  );
}
