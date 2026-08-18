"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  integer,
  max,
  maxLength,
  min,
  money,
  number,
  phone as phoneRule,
  range,
  required,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const SETTINGS_RULES: FieldRules = {
  delivery_radius_km: [required, number, min(LIMITS.radiusMin), max(LIMITS.radiusMax)],
  latitude: [number, range(LIMITS.latMin, LIMITS.latMax)],
  longitude: [number, range(LIMITS.lngMin, LIMITS.lngMax)],
  prep_time_minutes: [required, integer, min(LIMITS.minutesMin), max(LIMITS.minutesMax)],
  pickup_address: [maxLength(LIMITS.longTextMax)],
  pickup_phone: [phoneRule],
};

const ZONE_RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  center_lat: [required, number, range(LIMITS.latMin, LIMITS.latMax)],
  center_lng: [required, number, range(LIMITS.lngMin, LIMITS.lngMax)],
  radius_km: [required, number, min(LIMITS.radiusMin), max(LIMITS.radiusMax)],
  delivery_fee: [required, money],
};

interface Zone {
  id: number;
  name: string;
  center_lat: string;
  center_lng: string;
  radius_km: string;
  delivery_fee: string;
  is_active: boolean;
}

interface Settings {
  branch_id: number;
  latitude: string | null;
  longitude: string | null;
  delivery_radius_km: string;
  prep_time_minutes: number;
  pickup_enabled: boolean;
  pickup_address: string;
  pickup_phone: string;
  zones: Zone[];
}

const PREP_PRESETS = [20, 30, 45, 60];

/** Returns the parsed error map on failure, or null on success. */
async function api(url: string, method: string, body: unknown, fallback: string) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return parseFieldErrors(data, fallback);
  }
  return null;
}

/** BM delivery coverage + prep-time + pickup + named zones (own branch). */
export function DeliverySettingsPanel({ settings }: { settings: Settings }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [radius, setRadius] = useState(settings.delivery_radius_km);
  const [lat, setLat] = useState(settings.latitude ?? "");
  const [lng, setLng] = useState(settings.longitude ?? "");
  const [prep, setPrep] = useState(String(settings.prep_time_minutes));
  const [pickupEnabled, setPickupEnabled] = useState(settings.pickup_enabled);
  const [pickupAddress, setPickupAddress] = useState(settings.pickup_address);
  const [pickupPhone, setPickupPhone] = useState(settings.pickup_phone);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Zone draft
  const [zName, setZName] = useState("");
  const [zLat, setZLat] = useState("");
  const [zLng, setZLng] = useState("");
  const [zRadius, setZRadius] = useState("");
  const [zFee, setZFee] = useState("0");
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  const [zoneErrors, setZoneErrors] = useState<FieldErrors>({});
  const [settingsSubmit, setSettingsSubmit] = useState(0);
  const [zoneSubmit, setZoneSubmit] = useState(0);

  /** Coordinates are optional here, but must be supplied as a PAIR. */
  const validateCoords = useCallback((): FieldErrors => {
    if (lat.trim() && !lng.trim()) return { longitude: t("addresses.errCoordPair") };
    if (lng.trim() && !lat.trim()) return { latitude: t("addresses.errCoordPair") };
    return {};
  }, [lat, lng, t]);

  const saveSettings = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setOk(null);
      setBusy(true);
      void (async () => {
        try {
          const failure = await api(
            "/api/branch-manager/delivery-settings",
            "PATCH",
            {
              delivery_radius_km: radius,
              latitude: lat || undefined,
              longitude: lng || undefined,
              prep_time_minutes: prep,
              pickup_enabled: pickupEnabled,
              pickup_address: pickupAddress,
              pickup_phone: pickupPhone,
            },
            t("errors.generic"),
          );
          setSettingsSubmit((n) => n + 1);
          setSettingsErrors(failure?.fieldErrors ?? {});
          if (failure) {
            setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
            return;
          }
          setOk(t("common.saved"));
          router.refresh();
        } finally {
          setBusy(false);
        }
      })();
    },
    [lat, lng, pickupAddress, pickupEnabled, pickupPhone, prep, radius, router, t],
  );

  const addZone = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setBusy(true);
      void (async () => {
        try {
          const failure = await api(
            "/api/delivery-zones",
            "POST",
            {
              name: zName,
              center_lat: Number(zLat),
              center_lng: Number(zLng),
              radius_km: Number(zRadius),
              delivery_fee: Number(zFee),
            },
            t("errors.generic"),
          );
          setZoneSubmit((n) => n + 1);
          setZoneErrors(failure?.fieldErrors ?? {});
          if (failure) {
            setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
            return; // the draft keeps every value
          }
          setZName(""); setZLat(""); setZLng(""); setZRadius(""); setZFee("0");
          router.refresh();
        } finally {
          setBusy(false);
        }
      })();
    },
    [router, t, zFee, zLat, zLng, zName, zRadius],
  );

  const settingsForm = useFormValidation(SETTINGS_RULES, {
    validate: validateCoords,
    onSubmitValid: saveSettings,
    serverErrors: settingsErrors,
    submissionId: settingsSubmit,
    pending: busy,
  });

  const zoneForm = useFormValidation(ZONE_RULES, {
    onSubmitValid: addZone,
    serverErrors: zoneErrors,
    submissionId: zoneSubmit,
    pending: busy,
  });

  async function toggleZone(z: Zone) {
    const failure = await api(
      `/api/delivery-zones/${z.id}`,
      "PATCH",
      { is_active: !z.is_active },
      t("errors.generic"),
    );
    if (failure) {
      setError(failure.formError);
      return;
    }
    router.refresh();
  }

  async function removeZone(z: Zone) {
    const failure = await api(`/api/delivery-zones/${z.id}`, "DELETE", undefined, t("common.error"));
    if (failure) return { error: failure.formError };
    router.refresh();
    return { error: null };
  }

  return (
    <div className="space-y-6">
      <form {...settingsForm.formProps} className="space-y-4" data-testid="delivery-settings-form">
        <Alert tone="error" message={error} />
        {Object.keys(settingsForm.errors).length === 0 ? <Alert tone="success" message={ok} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t("bmExtras.radiusLabel")}
            name="delivery_radius_km"
            required
            error={settingsForm.errors.delivery_radius_km}
          >
            <Input name="delivery_radius_km" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} data-testid="radius-input" />
          </Field>
          <Field label={t("bmExtras.latLabel")} name="latitude" error={settingsForm.errors.latitude}>
            <Input name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="23.8103" data-testid="lat-input" />
          </Field>
          <Field label={t("bmExtras.lngLabel")} name="longitude" error={settingsForm.errors.longitude}>
            <Input name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="90.4125" data-testid="lng-input" />
          </Field>
        </div>

        <Field
          label={t("b2.prepTimeLabel")}
          name="prep_time_minutes"
          required
          hint={t("b2.prepTimeHint")}
          error={settingsForm.errors.prep_time_minutes}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input name="prep_time_minutes" type="number" min="1" value={prep} onChange={(e) => setPrep(e.target.value)} className="w-28" data-testid="prep-input" />
            <span className="text-sm text-fg-muted">{t("b2.minutes")}</span>
            <span className="ml-2 flex gap-1.5">
              {PREP_PRESETS.map((m) => (
                <button key={m} type="button" onClick={() => setPrep(String(m))}
                  className="rounded-lg border border-border-strong px-2.5 py-1 text-xs hover:bg-surface-hover">
                  {m}
                </button>
              ))}
            </span>
          </div>
        </Field>

        <div className="rounded-xl border border-border-strong p-4">
          <Checkbox name="pickup_enabled" label={t("b1.pickupEnabled")} checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} />
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={t("b1.pickupAddress")} name="pickup_address" error={settingsForm.errors.pickup_address}>
              <Input name="pickup_address" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
            </Field>
            <Field label={t("b1.pickupPhone")} name="pickup_phone" error={settingsForm.errors.pickup_phone}>
              <Input name="pickup_phone" value={pickupPhone} onChange={(e) => setPickupPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
          </div>
        </div>

        <Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button>
      </form>

      {/* Named zones */}
      <div className="rounded-xl border border-border-strong p-4">
        <h3 className="mb-3 font-semibold text-fg-base">{t("b1.namedZones")}</h3>
        {settings.zones.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("b1.noZones")}</p>
        ) : (
          <ul className="mb-4 divide-y divide-border-base" data-testid="zone-list">
            {settings.zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-medium text-fg-base">{z.name}</span>
                <span className="text-fg-muted">{z.radius_km} km · ৳{z.delivery_fee}</span>
                <span className="ml-auto flex gap-3">
                  <button type="button" className="text-brand-600 hover:underline" onClick={() => toggleZone(z)}>
                    {z.is_active ? t("common.disable") : t("common.enable")}
                  </button>
                  <ConfirmModal
                    trigger={<button type="button" className="text-red-600 hover:underline">{t("common.delete")}</button>}
                    title={t("b1.deleteZoneTitle")}
                    description={t("b1.deleteZoneDesc")}
                    confirmLabel={t("common.delete")}
                    action={() => removeZone(z)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <form {...zoneForm.formProps} className="grid gap-3 sm:grid-cols-6" data-testid="zone-form">
          <Field label={t("b1.zoneName")} name="name" required error={zoneForm.errors.name}>
            <Input name="name" value={zName} onChange={(e) => setZName(e.target.value)} data-testid="zone-name" />
          </Field>
          <Field label={t("bmExtras.latLabel")} name="center_lat" required error={zoneForm.errors.center_lat}>
            <Input name="center_lat" inputMode="decimal" value={zLat} onChange={(e) => setZLat(e.target.value)} data-testid="zone-lat" />
          </Field>
          <Field label={t("bmExtras.lngLabel")} name="center_lng" required error={zoneForm.errors.center_lng}>
            <Input name="center_lng" inputMode="decimal" value={zLng} onChange={(e) => setZLng(e.target.value)} data-testid="zone-lng" />
          </Field>
          <Field label={t("b1.zoneRadius")} name="radius_km" required error={zoneForm.errors.radius_km}>
            <Input name="radius_km" inputMode="decimal" value={zRadius} onChange={(e) => setZRadius(e.target.value)} data-testid="zone-radius" />
          </Field>
          <Field label={t("deliveryArea.charge")} name="delivery_fee" required error={zoneForm.errors.delivery_fee}>
            <Input name="delivery_fee" inputMode="decimal" min="0" value={zFee} onChange={(e) => setZFee(e.target.value)} data-testid="zone-fee" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" variant="outline" disabled={busy}>+ {t("b1.addZone")}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
