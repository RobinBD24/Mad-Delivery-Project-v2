"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FieldError } from "@/components/ui/field-error";
import {
  deleteCampaignAction,
  deleteCouponAction,
  deleteSegmentAction,
  saveCampaignAction,
  saveCouponAction,
  saveSegmentAction,
  sendSegmentNotificationAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  afterField,
  date as dateRule,
  integer,
  max,
  maxLength,
  min,
  money,
  oneOf,
  positive,
  required,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const CAMPAIGN_TYPES = ["discount", "offer", "promotion"];
const DISCOUNT_TYPES = ["percent", "fixed"];

const CAMPAIGN_RULES: FieldRules = {
  title: [required, maxLength(120)],
  description: [maxLength(LIMITS.longTextMax)],
  type: [required, oneOf(CAMPAIGN_TYPES)],
  starts_at: [required, dateRule],
  // The end of a campaign must come after its start.
  ends_at: [required, dateRule, afterField("starts_at")],
};

const SEGMENT_RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  location: [maxLength(LIMITS.shortTextMax)],
  min_orders: [integer, min(0)],
  days_since_last_order: [integer, min(0)],
};

export interface CampaignInitial {
  id: number;
  title: string;
  description: string;
  type: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  coupon: number | null;
}

export function CampaignForm({
  initial,
  coupons,
}: {
  initial: CampaignInitial | null;
  coupons: { id: number; code: string }[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "promotion");
  const [startsAt, setStartsAt] = useState(initial ? initial.starts_at.slice(0, 10) : "");
  const [endsAt, setEndsAt] = useState(initial ? initial.ends_at.slice(0, 10) : "");
  const [couponId, setCouponId] = useState(initial?.coupon ? String(initial.coupon) : "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await saveCampaignAction(initial?.id ?? null, {
          title: title.trim(),
          description: description.trim(),
          type,
          starts_at: `${startsAt}T00:00:00`,
          ends_at: `${endsAt}T23:59:59`,
          is_active: isActive,
          coupon_id: couponId ? Number(couponId) : null,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res?.fieldErrors ?? {});
        if (res?.error) setError(res.error);
      });
    },
    [couponId, description, endsAt, initial, isActive, startsAt, title, type],
  );

  const { errors, formProps } = useFormValidation(CAMPAIGN_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      <Field label={t("marketingX.campaignTitle")} name="title" required error={errors.title}>
        <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t("marketingX.descriptionLabel")} name="description" error={errors.description}>
        <Textarea name="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("marketingX.typeLabel")} name="type" required error={errors.type}>
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {CAMPAIGN_TYPES.map((k) => (
              <option key={k} value={k}>{t(`marketingX.type_${k}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("marketingX.couponLabel")} name="coupon_id" error={errors.coupon_id}>
          <Select name="coupon_id" value={couponId} onChange={(e) => setCouponId(e.target.value)}>
            <option value="">{t("marketingX.noCoupon")}</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("marketingX.startsLabel")} name="starts_at" required error={errors.starts_at}>
          <Input name="starts_at" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        {/* "must be after the start date" lands here — the field to change. */}
        <Field label={t("marketingX.endsLabel")} name="ends_at" required error={errors.ends_at}>
          <Input name="ends_at" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border-strong text-brand-500" />
        {t("marketingX.activeLabel")}
      </label>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
      </div>
    </form>
  );
}

export interface CouponInitial {
  id: number;
  code: string;
  discount_type: string;
  value: string;
  min_order: string;
  max_uses: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export function CouponForm({ initial }: { initial: CouponInitial | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(initial?.code ?? "");
  const [discountType, setDiscountType] = useState(initial?.discount_type ?? "percent");
  const [value, setValue] = useState(initial?.value ?? "");
  const [minOrder, setMinOrder] = useState(initial?.min_order ?? "0");
  const [maxUses, setMaxUses] = useState(initial ? String(initial.max_uses) : "0");
  const [startsAt, setStartsAt] = useState(initial?.starts_at ? initial.starts_at.slice(0, 10) : "");
  const [endsAt, setEndsAt] = useState(initial?.ends_at ? initial.ends_at.slice(0, 10) : "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** A percentage discount can never exceed 100. */
  const validatePercent = useCallback((): FieldErrors => {
    const v = Number(value);
    if (discountType === "percent" && Number.isFinite(v) && v > LIMITS.percentMax) {
      return { value: t("marketingX.errPercent") };
    }
    return {};
  }, [discountType, value, t]);

  const RULES: FieldRules = {
    code: [required, maxLength(24)],
    discount_type: [required, oneOf(DISCOUNT_TYPES)],
    value: [required, money, positive],
    min_order: [required, money],
    max_uses: [required, integer, min(0), max(LIMITS.pointsMax)],
    starts_at: [dateRule],
    ends_at: [dateRule, afterField("starts_at")],
  };

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await saveCouponAction(initial?.id ?? null, {
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          value,
          min_order: minOrder || "0",
          max_uses: Number(maxUses),
          starts_at: startsAt ? `${startsAt}T00:00:00` : undefined,
          ends_at: endsAt ? `${endsAt}T23:59:59` : undefined,
          is_active: isActive,
        });
        setSubmissionId((n) => n + 1);
        // A duplicate coupon code comes back keyed `code` and lands there.
        setServerErrors(res?.fieldErrors ?? {});
        if (res?.error) setError(res.error);
      });
    },
    [code, discountType, endsAt, initial, isActive, maxUses, minOrder, startsAt, value],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    validate: validatePercent,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("marketingX.codeLabel")} name="code" required error={errors.code}>
          <Input name="code" className="uppercase" value={code} onChange={(e) => setCode(e.target.value)} maxLength={24} />
        </Field>
        <Field label={t("marketingX.discountTypeLabel")} name="discount_type" required error={errors.discount_type}>
          <Select name="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
            <option value="percent">{t("marketingX.percent")}</option>
            <option value="fixed">{t("marketingX.fixed")}</option>
          </Select>
        </Field>
        <Field label={t("marketingX.valueLabel")} name="value" required error={errors.value}>
          <Input name="value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label={t("marketingX.minOrderLabel")} name="min_order" required error={errors.min_order}>
          <Input name="min_order" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </Field>
        <Field label={t("marketingX.maxUsesLabel")} name="max_uses" required error={errors.max_uses}>
          <Input name="max_uses" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
        <Field label={t("marketingX.startsLabel")} name="starts_at" error={errors.starts_at}>
          <Input name="starts_at" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label={t("marketingX.endsLabel")} name="ends_at" error={errors.ends_at}>
          <Input name="ends_at" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border-strong text-brand-500" />
        {t("marketingX.activeLabel")}
      </label>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
      </div>
    </form>
  );
}

export function SegmentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [recentDays, setRecentDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await saveSegmentAction({
          name: name.trim(),
          location: location.trim() || undefined,
          min_orders: minOrders ? Number(minOrders) : undefined,
          days_since_last_order: recentDays ? Number(recentDays) : undefined,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        // Cleared only after the segment was created.
        setName("");
        setLocation("");
        setMinOrders("");
        setRecentDays("");
        router.refresh();
      });
    },
    [location, minOrders, name, recentDays, router],
  );

  const { errors, formProps } = useFormValidation(SEGMENT_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("marketingX.segmentNameLabel")} name="name" required error={errors.name}>
        <Input name="name" placeholder={t("marketingX.segmentNameLabel")} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("marketingX.locationLabel")} name="location" error={errors.location}>
        <Input name="location" placeholder={t("marketingX.locationLabel")} value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label={t("marketingX.minOrdersLabel")} name="min_orders" error={errors.min_orders}>
        <Input name="min_orders" inputMode="numeric" placeholder={t("marketingX.minOrdersLabel")} value={minOrders} onChange={(e) => setMinOrders(e.target.value)} />
      </Field>
      <Field label={t("marketingX.recentDaysLabel")} name="days_since_last_order" error={errors.days_since_last_order}>
        <Input name="days_since_last_order" inputMode="numeric" placeholder={t("marketingX.recentDaysLabel")} value={recentDays} onChange={(e) => setRecentDays(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.saving") : t("marketingX.createSegment")}
      </Button>
    </form>
  );
}

export function SegmentRowActions({ segmentId }: { segmentId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  function send(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    // Client validation first; both messages land under their own inputs.
    const nextTitle = title.trim() ? null : t("validation.required");
    const nextBody = body.trim() ? null : t("validation.required");
    setTitleError(nextTitle);
    setBodyError(nextBody);
    if (nextTitle || nextBody) return;
    start(async () => {
      const res = await sendSegmentNotificationAction(segmentId, title.trim(), body.trim());
      if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
        setTitleError(res.fieldErrors?.title ?? null);
        setBodyError(res.fieldErrors?.body ?? null);
        setError(Object.keys(res.fieldErrors ?? {}).length ? null : res.error);
        return;
      }
      setMsg(res.success ?? null);
      setSending(false);
      setTitle("");
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setSending((v) => !v)}>
          {t("marketingX.sendNotification")}
        </Button>
        <ConfirmModal
          trigger={
            <Button size="sm" variant="ghost" className="text-red-600">
              {t("common.delete")}
            </Button>
          }
          title={t("marketingX.deleteSegmentTitle")}
          description={t("marketingX.deleteSegmentDesc")}
          confirmLabel={t("common.delete")}
          action={async () => {
            const res = await deleteSegmentAction(segmentId);
            router.refresh();
            return res;
          }}
        />
      </div>
      {sending ? (
        <form onSubmit={send} noValidate className="flex w-64 flex-col gap-1.5">
          <div>
            <Input
              autoFocus
              name="title"
              className="px-2.5 py-1.5 text-xs"
              placeholder={t("notices.subject")}
              aria-label={t("notices.subject")}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? `segment-${segmentId}-title-error` : undefined}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            <FieldError id={`segment-${segmentId}-title-error`} message={titleError} />
          </div>
          <div>
            <Input
              name="body"
              className="px-2.5 py-1.5 text-xs"
              placeholder={t("notices.body")}
              aria-label={t("notices.body")}
              aria-invalid={Boolean(bodyError)}
              aria-describedby={bodyError ? `segment-${segmentId}-body-error` : undefined}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (bodyError) setBodyError(null);
              }}
            />
            <FieldError id={`segment-${segmentId}-body-error`} message={bodyError} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {t("marketingX.send")}
          </Button>
        </form>
      ) : null}
      {msg ? <p className="text-xs text-emerald-600">{msg}</p> : null}
      {error ? <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
    </div>
  );
}

export function CampaignDeleteButton({ campaignId }: { campaignId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ConfirmModal
      trigger={
        <Button size="sm" variant="ghost" className="text-red-600">
          {t("common.delete")}
        </Button>
      }
      title={t("marketingX.deleteCampaignTitle")}
      description={t("marketingX.deleteCampaignDesc")}
      confirmLabel={t("common.delete")}
      action={async () => {
        const res = await deleteCampaignAction(campaignId);
        router.refresh();
        return res;
      }}
    />
  );
}

export function CouponDeleteButton({ couponId }: { couponId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ConfirmModal
      trigger={
        <Button size="sm" variant="ghost" className="text-red-600">
          {t("common.delete")}
        </Button>
      }
      title={t("marketingX.deleteCouponTitle")}
      description={t("marketingX.deleteCouponDesc")}
      confirmLabel={t("common.delete")}
      action={async () => {
        const res = await deleteCouponAction(couponId);
        router.refresh();
        return res;
      }}
    />
  );
}
