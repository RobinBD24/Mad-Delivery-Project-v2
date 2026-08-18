"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Field, Input } from "@/components/ui/input";
import { saveRewardConfigAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { integer, max, min, money, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

interface RuleT {
  key: string;
  coins: number;
  is_active: boolean;
}

const RULES: FieldRules = {
  coin_value_tk: [required, money],
  min_redeem_coins: [required, integer, min(LIMITS.pointsMin), max(LIMITS.pointsMax)],
};

/** Super-admin editor: coin Tk value, min redeem, per-activity earn rules. */
export function RewardConfigForm({
  coinValueTk,
  minRedeemCoins,
  rules,
}: {
  coinValueTk: string;
  minRedeemCoins: number;
  rules: RuleT[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Controlled values — never cleared by a failed submission.
  const [coinValue, setCoinValue] = useState(coinValueTk);
  const [minRedeem, setMinRedeem] = useState(String(minRedeemCoins));
  const [ruleState, setRuleState] = useState<RuleT[]>(rules);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** Each earn rule is a repeated row — checked and reported per row. */
  const validateRules = useCallback((): FieldErrors => {
    const found: FieldErrors = {};
    for (const r of ruleState) {
      const raw = String(r.coins ?? "");
      if (raw.trim() === "") {
        found[`rules.${r.key}.coins`] = t("validation.required");
        continue;
      }
      const problem =
        integer(raw, {}) ?? min(LIMITS.pointsMin)(raw, {}) ?? max(LIMITS.pointsMax)(raw, {});
      if (problem) found[`rules.${r.key}.coins`] = t(problem.key, problem.vars);
    }
    return found;
  }, [ruleState, t]);

  /**
   * Runs only after every client rule passed — the hook cancels the submit
   * otherwise. Whatever the server sends back is mapped onto the same fields.
   */
  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await saveRewardConfigAction({
          coin_value_tk: coinValue,
          min_redeem_coins: Number(minRedeem),
          rules: ruleState,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        router.refresh();
      });
    },
    [coinValue, minRedeem, ruleState, router],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    validate: validateRules,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  function setRule(key: string, patch: Partial<RuleT>) {
    setRuleState((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form {...formProps} className="space-y-5">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("rewards.coinValueLabel")}
          name="coin_value_tk"
          required
          hint={t("rewards.coinValueHint")}
          error={errors.coin_value_tk}
        >
          <Input
            name="coin_value_tk"
            inputMode="decimal"
            value={coinValue}
            onChange={(e) => setCoinValue(e.target.value)}
          />
        </Field>
        <Field
          label={t("rewards.minRedeemLabel")}
          name="min_redeem_coins"
          required
          error={errors.min_redeem_coins}
        >
          <Input
            name="min_redeem_coins"
            inputMode="numeric"
            value={minRedeem}
            onChange={(e) => setMinRedeem(e.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-fg-base">{t("rewards.earnRules")}</p>
        {ruleState.map((r) => {
          const rowError = errors[`rules.${r.key}.coins`];
          return (
            <div key={r.key} className="rounded-xl border border-border-base px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1 text-sm font-medium text-fg-base">
                  {t(`rewards.rule_${r.key}`)}
                </span>
                <Input
                  name={`rules.${r.key}.coins`}
                  inputMode="numeric"
                  aria-label={t(`rewards.rule_${r.key}`)}
                  aria-invalid={Boolean(rowError)}
                  aria-describedby={rowError ? `rules-${r.key}-error` : undefined}
                  data-reward-key={r.key}
                  className="w-24"
                  value={String(r.coins)}
                  onChange={(e) => setRule(r.key, { coins: Number(e.target.value) })}
                />
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    onChange={(e) => setRule(r.key, { is_active: e.target.checked })}
                    className="size-4 rounded border-border-strong text-brand-500"
                  />
                  {t("rewards.active")}
                </label>
              </div>
              {/* The row's own message, directly under the row it belongs to. */}
              <FieldError id={`rules-${r.key}-error`} message={rowError} />
            </div>
          );
        })}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
