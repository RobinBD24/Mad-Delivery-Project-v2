"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useTranslation } from "@/lib/i18n/use-translation";
import { deleteCategoryAction, setCategoryActiveAction } from "@/lib/api/actions";

/**
 * req #2 + #3 — Super Admin category actions.
 *
 * Delete: the dialog names the exact category AND its scope, and states up front
 * whether the result will be a permanent DELETE (no products) or a DEACTIVATION
 * (has products — existing products and order history stay intact). The server
 * makes the final decision; RBAC is enforced there, not by hiding this UI.
 *
 * Activate / Deactivate: an explicit state toggle. Deactivation is confirmed;
 * activation applies directly (consistent with the other list toggles). A repeat
 * of the current state is rejected server-side with 409.
 */
export function CategoryActions({
  categoryId,
  name,
  scope,
  isActive,
  productCount,
}: {
  categoryId: number;
  name: string;
  scope: string;
  isActive: boolean;
  productCount: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function activate() {
    setError(null);
    startTransition(async () => {
      const res = await setCategoryActiveAction(categoryId, true);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const deleteDescription = `${t("categories.deleteNamed", { name, scope })} ${
    productCount > 0 ? t("categories.deleteWillDeactivate") : t("categories.deleteWillRemove")
  }`;

  return (
    <span className="flex flex-wrap items-center justify-end gap-3 text-sm font-medium">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}

      {isActive ? (
        <ConfirmModal
          trigger={
            <button type="button" className="text-fg-muted hover:underline" data-testid={`category-deactivate-${categoryId}`}>
              {t("categories.deactivate")}
            </button>
          }
          title={t("categories.deactivateTitle")}
          description={t("categories.deactivateDesc", { name })}
          confirmLabel={t("categories.confirmDeactivate")}
          action={async () => setCategoryActiveAction(categoryId, false)}
        />
      ) : (
        <Button
          size="sm"
          variant="success"
          onClick={activate}
          disabled={pending}
          data-testid={`category-activate-${categoryId}`}
        >
          {t("categories.activate")}
        </Button>
      )}

      <ConfirmModal
        trigger={
          <button type="button" className="text-red-600 hover:underline" data-testid={`category-delete-${categoryId}`}>
            {t("common.delete")}
          </button>
        }
        title={t("categories.deleteTitle")}
        description={deleteDescription}
        confirmLabel={t("categories.confirmDelete")}
        action={async () => deleteCategoryAction(categoryId)}
      />
    </span>
  );
}
