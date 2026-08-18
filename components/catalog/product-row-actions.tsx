"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/layout/icons";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  deleteProductAction,
  setProductHoldAction,
  toggleProductAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

/** Which confirmation is currently open. `null` = none. */
type Dialog = "hold" | "availability" | "delete" | null;

export interface ProductRowActionsProps {
  productId: number;
  productName: string;
  branchName: string;
  isAvailable: boolean;
  heldByAdmin: boolean;
  /** Base path of the owning section, e.g. "/admin/products". */
  basePath: string;
  /** Super-admin-only actions (hold/resume, soft delete). */
  canHold?: boolean;
  canDelete?: boolean;
}

/**
 * The one compact action menu for a product row — View, Edit, Hold/Resume,
 * Activate/Deactivate, Delete.
 *
 * The destructive items open a confirmation dialog that names the product and
 * says plainly what the operation does (a "delete" here is a SOFT delete, and
 * the copy says so). Dialog state lives HERE rather than inside each modal,
 * because the menu unmounts on the click that chooses an item and would take an
 * uncontrolled dialog's overlay down with it. State is reset on every exit —
 * success, failure or cancel — so a later row can never inherit it.
 */
export function ProductRowActions({
  productId,
  productName,
  branchName,
  isAvailable,
  heldByAdmin,
  basePath,
  canHold = false,
  canDelete = false,
}: ProductRowActionsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  /** Every dialog closes through here, so focus and state always reset together. */
  const closeDialog = () => {
    setDialog(null);
    triggerRef.current?.focus();
  };

  const itemClass =
    "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-fg-base hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
  const dangerClass =
    "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-red-400 dark:hover:bg-red-500/10";

  const choose = (next: Dialog) => {
    setMenuOpen(false);
    setDialog(next);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("catalog.actionsFor", { name: productName })}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        data-testid={`product-actions-${productId}`}
        onClick={() => setMenuOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Icon name="list" className="size-4.5" />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-10 z-30 min-w-48 overflow-hidden rounded-xl border border-border-base bg-surface-card p-1.5 shadow-xl">
          <Link
            href={`${basePath}/${productId}`}
            className={itemClass}
            data-testid={`product-view-${productId}`}
            onClick={() => setMenuOpen(false)}
          >
            {t("common.view")}
          </Link>
          <Link
            href={`${basePath}/${productId}/edit`}
            className={itemClass}
            data-testid={`product-edit-${productId}`}
            onClick={() => setMenuOpen(false)}
          >
            {t("common.edit")}
          </Link>
          <button
            type="button"
            className={isAvailable ? dangerClass : itemClass}
            data-testid={`product-availability-${productId}`}
            onClick={() => choose("availability")}
          >
            {isAvailable ? t("catalog.deactivate") : t("catalog.activate")}
          </button>
          {canHold ? (
            <button
              type="button"
              className={heldByAdmin ? itemClass : dangerClass}
              data-testid={`product-hold-${productId}`}
              onClick={() => choose("hold")}
            >
              {heldByAdmin ? t("adminExtras.releaseHold") : t("adminExtras.hold")}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className={cn(dangerClass, "border-t border-border-base")}
              data-testid={`product-delete-${productId}`}
              onClick={() => choose("delete")}
            >
              {t("common.delete")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Deactivate requires a reason (it is shown to the branch); reactivating
          does not, so the textarea is only offered on the way down. */}
      <ConfirmModal
        open={dialog === "availability"}
        onOpenChange={(next) => (next ? setDialog("availability") : closeDialog())}
        title={isAvailable ? t("catalog.deactivateProductTitle") : t("catalog.activateProductTitle")}
        description={
          isAvailable
            ? t("catalog.deactivateProductConfirm", { name: productName, branch: branchName })
            : t("catalog.activateProductConfirm", { name: productName, branch: branchName })
        }
        confirmLabel={isAvailable ? t("catalog.deactivate") : t("catalog.activate")}
        withReason={isAvailable}
        reasonPlaceholder={t("catalog.deactivationReasonPlaceholder")}
        action={async (reason) => toggleProductAction(productId, reason)}
        onDone={() => router.refresh()}
      />

      <ConfirmModal
        open={dialog === "hold"}
        onOpenChange={(next) => (next ? setDialog("hold") : closeDialog())}
        title={heldByAdmin ? t("catalog.resumeProductTitle") : t("catalog.holdProductTitle")}
        description={
          heldByAdmin
            ? t("catalog.resumeProductConfirm", { name: productName })
            : t("catalog.holdProductConfirm", { name: productName })
        }
        confirmLabel={heldByAdmin ? t("adminExtras.releaseHold") : t("adminExtras.hold")}
        action={async () => setProductHoldAction(productId, !heldByAdmin)}
        onDone={() => router.refresh()}
      />

      <ConfirmModal
        open={dialog === "delete"}
        onOpenChange={(next) => (next ? setDialog("delete") : closeDialog())}
        title={t("catalog.deleteProductTitle")}
        // States explicitly that this is a SOFT delete and that order history
        // survives — the modal must describe the operation it performs.
        description={t("catalog.deleteProductConfirm", { name: productName, branch: branchName })}
        confirmLabel={t("catalog.confirmDelete")}
        action={async () => deleteProductAction(productId)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
