"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, Textarea } from "@/components/ui/input";
import { submitReviewAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = { comment: [maxLength(LIMITS.longTextMax)] };

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: (n: number) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={label(n)}
          aria-pressed={n === value}
          className={cn(
            "text-2xl transition-transform hover:scale-110",
            n <= value ? "text-amber-400" : "text-slate-300",
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** Star-rating review form — rider rating or per-product food review. */
export function ReviewForm({
  orderId,
  type,
  productId,
  targetLabel,
}: {
  orderId: number;
  type: "rider" | "food";
  productId?: number;
  targetLabel: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** The star control is not an <input>, so the rating is checked here. */
  const validateRating = useCallback((): FieldErrors => {
    if (rating < LIMITS.ratingMin || rating > LIMITS.ratingMax) {
      return { rating: t("reviews.errRating") };
    }
    return {};
  }, [rating, t]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await submitReviewAction({
          order_id: orderId,
          type,
          rating,
          comment: comment.trim(),
          product_id: productId,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        router.refresh();
      });
    },
    [comment, orderId, productId, rating, router, type],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    validate: validateRating,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3 rounded-xl border border-border-base p-4">
      <p className="text-sm font-semibold text-fg-base">{targetLabel}</p>
      <Alert tone="error" message={error} />

      {/* One accessible label + one message for the whole star group. */}
      <FieldGroup label={t("reviews.ratingLabel")} name="rating" required error={errors.rating}>
        <Stars
          value={rating}
          onChange={setRating}
          label={(n) => t("reviews.starLabel", { n })}
        />
      </FieldGroup>

      <Textarea
        name="comment"
        rows={2}
        placeholder={t("reviews.commentPlaceholder")}
        aria-label={t("reviews.commentPlaceholder")}
        aria-invalid={Boolean(errors.comment)}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("common.saving") : t("reviews.submit")}
      </Button>
    </form>
  );
}
