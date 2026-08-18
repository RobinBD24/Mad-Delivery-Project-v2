"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Select } from "@/components/ui/input";
import { assignRiderBranchAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Super Admin: set a rider's home branch/outlet. */
export function AssignRiderBranchForm({
  riderUserId,
  currentBranchId,
  branches,
}: {
  riderUserId: number;
  currentBranchId: number | null;
  branches: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState(currentBranchId ? String(currentBranchId) : "");
  const [feedback, setFeedback] = useState<{ error: string | null; success?: string }>({ error: null });
  const [branchError, setBranchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await assignRiderBranchAction(riderUserId, branchId ? Number(branchId) : null);
      setFeedback(result);
      // An invalid/inaccessible branch comes back keyed `branch_id`.
      setBranchError(result.fieldErrors?.branch_id ?? null);
    });
  }

  return (
    // Clearing the branch is valid, so no client rule beyond the enum the
    // dropdown itself constrains; the server re-checks access to the branch.
    <form onSubmit={save} noValidate className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select
          name="branch_id"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            if (branchError) setBranchError(null);
          }}
          className="max-w-48"
          aria-label={t("rider.noBranchOption")}
          aria-invalid={Boolean(branchError)}
          aria-describedby={branchError ? `rider-${riderUserId}-branch-error` : undefined}
        >
          <option value="">{t("rider.noBranchOption")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {t("common.save")}
        </Button>
      </div>
      <FieldError id={`rider-${riderUserId}-branch-error`} message={branchError} />
      {feedback.error && !branchError ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{feedback.error}</p>
      ) : null}
      {feedback.success ? <p className="text-xs text-emerald-600">{feedback.success}</p> : null}
    </form>
  );
}
