"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/layout/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, number, range, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = {
  label: [required, maxLength(40)],
  custom_label: [maxLength(40)],
  address: [required, maxLength(LIMITS.longTextMax)],
  area: [maxLength(80)],
  instructions: [maxLength(200)],
  latitude: [number, range(LIMITS.latMin, LIMITS.latMax)],
  longitude: [number, range(LIMITS.lngMin, LIMITS.lngMax)],
};

export interface AddressT {
  id: number;
  label: string;
  custom_label?: string;
  display_label?: string;
  address: string;
  area?: string;
  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
  is_active?: boolean;
}

const PRESET_LABELS = ["home", "office", "secondHome", "other"] as const;

// Distinct icon per address kind. The stored label is free text (a localized
// preset or a custom string) so we match it against the localized presets and
// fall back to a generic pin for anything custom.
const PRESET_ICONS: Record<(typeof PRESET_LABELS)[number], string> = {
  home: "home",
  office: "briefcase",
  secondHome: "building",
  other: "pin",
};

/** Full CRUD manager for the customer's saved addresses. */
export function AddressManager({ addresses }: { addresses: AddressT[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Pick a distinct icon by matching the stored label to a localized preset.
  function iconForLabel(rawLabel: string): string {
    const norm = rawLabel.trim().toLowerCase();
    for (const key of PRESET_LABELS) {
      if (t(`addresses.preset_${key}`).toLowerCase() === norm) return PRESET_ICONS[key];
    }
    return "pin";
  }

  const [editing, setEditing] = useState<AddressT | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [addressText, setAddressText] = useState("");
  const [area, setArea] = useState("");
  const [instructions, setInstructions] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  // "Others" reveals a free-text custom label (matches the localized preset).
  const isOther = label.trim().toLowerCase() === t("addresses.preset_other").toLowerCase();

  /** Coordinates are optional but must be supplied as a PAIR. */
  const validateCoords = useCallback((): FieldErrors => {
    const hasLat = lat.trim() !== "";
    const hasLng = lng.trim() !== "";
    if (hasLat && !hasLng) return { longitude: t("addresses.errCoordPair") };
    if (hasLng && !hasLat) return { latitude: t("addresses.errCoordPair") };
    return {};
  }, [lat, lng, t]);

  function openCreate() {
    setEditing(null);
    setLabel("");
    setCustomLabel("");
    setAddressText("");
    setArea("");
    setInstructions("");
    setLat("");
    setLng("");
    setIsDefault(addresses.length === 0);
    setError(null);
    setServerErrors({});
    resetErrors();
    setShowForm(true);
  }

  function openEdit(a: AddressT) {
    setEditing(a);
    setLabel(a.label);
    setCustomLabel(a.custom_label ?? "");
    setAddressText(a.address);
    setArea(a.area ?? "");
    setInstructions(a.instructions ?? "");
    setLat(a.latitude != null ? String(a.latitude) : "");
    setLng(a.longitude != null ? String(a.longitude) : "");
    setIsDefault(a.is_default);
    setError(null);
    setServerErrors({});
    resetErrors();
    setShowForm(true);
  }

  /** Runs only after every client rule passed. */
  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      const hasCoords = lat.trim() !== "" && lng.trim() !== "";
      start(async () => {
        const res = await saveAddressAction(editing?.id ?? null, {
          label: label.trim(),
          custom_label: isOther ? customLabel.trim() : "",
          address: addressText.trim(),
          area: area.trim(),
          instructions: instructions.trim(),
          ...(hasCoords
            ? { latitude: Number(lat), longitude: Number(lng) }
            : { latitude: null, longitude: null }),
          is_default: isDefault,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          // The form stays OPEN with every value the customer typed.
          setError(res.error);
          return;
        }
        setShowForm(false); // closed only after a confirmed save
        router.refresh();
      });
    },
    [addressText, area, customLabel, editing, instructions, isDefault, isOther, label, lat, lng, router],
  );

  const { errors, formProps, reset: resetErrors } = useFormValidation(RULES, {
    validate: validateCoords,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <div className="space-y-4">
      {!showForm ? (
        <div className="flex justify-end">
          <Button onClick={openCreate} data-testid="add-address">
            <Icon name="plus" className="size-4" /> {t("addresses.add")}
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent>
            <form {...formProps} className="space-y-4" data-testid="address-form">
              <Alert tone="error" message={error} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Field label={t("addresses.labelField")} name="label" required error={errors.label}>
                    <Input
                      name="label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      maxLength={40}
                      data-testid="addr-label"
                    />
                  </Field>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PRESET_LABELS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLabel(t(`addresses.preset_${key}`))}
                        className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-fg-muted hover:bg-brand-50 hover:text-brand-600"
                      >
                        {t(`addresses.preset_${key}`)}
                      </button>
                    ))}
                  </div>
                  {isOther ? (
                    <Field
                      label={t("addresses.customLabelPlaceholder")}
                      name="custom_label"
                      className="mt-2"
                      error={errors.custom_label}
                    >
                      <Input
                        name="custom_label"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        maxLength={40}
                        placeholder={t("addresses.customLabelPlaceholder")}
                        data-testid="addr-custom-label"
                      />
                    </Field>
                  ) : null}
                </div>
                <Field label={t("addresses.addressField")} name="address" required error={errors.address}>
                  <Textarea
                    name="address"
                    rows={3}
                    value={addressText}
                    onChange={(e) => setAddressText(e.target.value)}
                    data-testid="addr-address"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("addresses.areaField")} name="area" error={errors.area}>
                  <Input name="area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} data-testid="addr-area" />
                </Field>
                <Field label={t("addresses.instructionsField")} name="instructions" error={errors.instructions}>
                  <Input name="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={200} data-testid="addr-instructions" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("addresses.latField")} name="latitude" error={errors.latitude}>
                  <Input name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="23.79" data-testid="addr-lat" />
                </Field>
                <Field label={t("addresses.lngField")} name="longitude" error={errors.longitude}>
                  <Input name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="90.41" data-testid="addr-lng" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="size-4 rounded border-border-strong text-brand-500"
                />
                {t("addresses.makeDefault")}
              </label>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {addresses.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            title={t("addresses.emptyTitle")}
            description={t("addresses.emptyDesc")}
            action={
              <Button size="sm" onClick={openCreate}>
                {t("addresses.add")}
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon name={iconForLabel(a.label)} className="size-4" />
                    </span>
                    <span className="font-semibold text-fg-base">{a.display_label ?? a.label}</span>
                    {a.is_default ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200" data-testid="addr-default-badge">
                        {t("addresses.default")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{a.address}</p>
                  {a.area ? <p className="mt-1 text-xs text-fg-subtle">📍 {a.area}</p> : null}
                  {a.instructions ? <p className="mt-1 flex-1 text-xs text-fg-subtle">📝 {a.instructions}</p> : <span className="flex-1" />}
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <button type="button" onClick={() => openEdit(a)} className="font-medium text-fg-muted hover:text-brand-600 hover:underline">
                      {t("common.edit")}
                    </button>
                    {!a.is_default ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await setDefaultAddressAction(a.id);
                            router.refresh();
                          })
                        }
                        className="font-medium text-fg-muted hover:text-brand-600 hover:underline"
                      >
                        {t("addresses.setDefault")}
                      </button>
                    ) : null}
                    <ConfirmModal
                      trigger={
                        <button type="button" className="font-medium text-red-600 hover:underline">
                          {t("common.delete")}
                        </button>
                      }
                      title={t("addresses.deleteTitle")}
                      description={t("addresses.deleteDesc")}
                      confirmLabel={t("common.delete")}
                      action={async () => {
                        const res = await deleteAddressAction(a.id);
                        router.refresh();
                        return res;
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
