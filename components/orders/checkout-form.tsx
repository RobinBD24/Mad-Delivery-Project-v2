"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError } from "@/components/ui/field-error";
import { Field, FieldGroup, Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { placeOrderAction } from "@/lib/api/actions";
import { useCart } from "@/lib/hooks/use-cart";
import { useTranslation } from "@/lib/i18n/use-translation";
import { PAYMENT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, number, oneOf, range, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import type { PaymentMethod } from "@/types";

const PAYMENT_METHODS = Object.keys(PAYMENT_LABELS);

const RULES: FieldRules = {
  delivery_address: [required, maxLength(LIMITS.longTextMax)],
  payment_method: [required, oneOf(PAYMENT_METHODS)],
  lat: [number, range(LIMITS.latMin, LIMITS.latMax)],
  lng: [number, range(LIMITS.lngMin, LIMITS.lngMax)],
  food_notes: [maxLength(LIMITS.longTextMax)],
  coupon_code: [maxLength(LIMITS.shortTextMax)],
};

interface CoverageResult {
  covered: boolean;
  distance_km: number | null;
  delivery_fee: number;
  nearest_pickup: {
    branch_name: string;
    address: string;
    phone: string;
    distance_km: number | null;
    opening_time: string | null;
    closing_time: string | null;
    directions_url: string | null;
  } | null;
}

interface AreaOption {
  id: number;
  name: string;
  is_held: boolean;
  hold_reason: string;
  delivery_charge: string;
  estimated_delivery_minutes: number;
}

interface Quote {
  branch: { id: number; name: string };
  area: { id: number; name: string; delivery_charge: number; estimated_delivery_minutes: number } | null;
  subtotal: number;
  delivery_charge: number;
  prep_time_minutes: number | null;
  delivery_estimate_minutes: number | null;
  overall_estimate_minutes: number | null;
  total: number;
}

/** Checkout: address + delivery area + payment → server-priced order (req #6). */
/** A per-checkout-attempt key. Random is fine: it only needs to be unique. */
function newAttemptKey(): string {
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CheckoutForm({ defaultAddress }: { defaultAddress: string }) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const { cart, total, clearCart } = useCart();
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [address, setAddress] = useState(defaultAddress);
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);
  // PHASE R — stable per-attempt idempotency key (see submit()).
  const attemptKey = useRef(newAttemptKey());
  const [pending, startTransition] = useTransition();
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  // B1 (coverage/pickup) + B2 (prep estimate)
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);

  // #1/#6 — delivery-area selector + server-derived summary quote.
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areaId, setAreaId] = useState<string>("");
  const [quote, setQuote] = useState<Quote | null>(null);

  const branchId = cart.branchId;

  useEffect(() => {
    if (branchId == null) return;
    let active = true;
    fetch(`/api/branches/${branchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (active && b) setPrepMinutes(b.prep_time_minutes ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [branchId]);

  // Load the branch's active delivery areas for the selector.
  useEffect(() => {
    if (branchId == null) return;
    let active = true;
    fetch(`/api/branches/${branchId}/delivery-areas`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => { if (active) setAreas(d.results ?? []); })
      .catch(() => { if (active) setAreas([]); });
    return () => { active = false; };
  }, [branchId]);

  const selectedArea = areas.find((a) => String(a.id) === areaId) ?? null;

  // Server-derived quote (subtotal / charge / estimates / total). Recomputed when
  // coverage, area, coordinates or fulfillment change. Delivery needs confirmed
  // coverage + coordinates; pickup can be quoted immediately.
  const refreshQuote = useCallback(async () => {
    if (branchId == null || cart.items.length === 0) { setQuote(null); return; }
    const ready = fulfillment === "pickup" || (coverage?.covered && !!lat && !!lng);
    if (!ready) { setQuote(null); return; }
    try {
      const res = await fetch("/api/delivery/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          fulfillment_type: fulfillment,
          ...(lat && lng ? { lat: Number(lat), lng: Number(lng) } : {}),
          delivery_area_id: fulfillment === "delivery" && areaId ? Number(areaId) : null,
          items: cart.items.map((i) => ({
            product_id: i.productId,
            variation_id: i.variationId ?? undefined,
            variation_type: i.variationType,
            quantity: i.quantity,
          })),
        }),
      });
      if (!res.ok) { setQuote(null); return; }
      setQuote((await res.json()) as Quote);
    } catch {
      setQuote(null);
    }
  }, [branchId, cart.items, fulfillment, coverage, lat, lng, areaId]);

  // Syncs the server-derived quote (an external system) into state whenever the
  // priced inputs change — the canonical use for an effect. The synchronous
  // setQuote(null) clears a stale quote when inputs become invalid.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshQuote(); }, [refreshQuote]);

  async function checkCoverage() {
    setError(null);
    // Location is checked before the request, with the message under its field.
    if (!lat || !lng) {
      setCoverageError(t("b1.enterLocation"));
      return;
    }
    setCoverageError(null);
    setChecking(true);
    try {
      const res = await fetch("/api/delivery/coverage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: cart.branchId, lat: Number(lat), lng: Number(lng) }),
      });
      const data = await res.json();
      if (!res.ok) { setCoverageError(t("b1.coverageError")); return; }
      setCoverage(data);
      setFulfillment(data.covered ? "delivery" : "pickup");
    } catch { setCoverageError(t("b1.coverageError")); } finally { setChecking(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await placeOrderAction({
        branch_id: cart.branchId!,
        // PHASE R — one key per checkout attempt. A double-tap or a retry after
        // a slow response reuses it, and the server returns the order it
        // already created instead of placing a second one.
        idempotency_key: attemptKey.current,
        payment_method: payment,
        delivery_address: address,
        food_notes: notes,
        coupon_code: coupon.trim() || undefined,
        items: cart.items.map((i) => ({
          product_id: i.productId,
          variation_id: i.variationId ?? undefined,
          // req #4 — chosen crust; re-validated server-side against the product.
          variation_type: i.variationType,
          quantity: i.quantity,
          food_note: i.foodNote,
        })),
        fulfillment_type: fulfillment,
        ...(fulfillment === "delivery" && areaId ? { delivery_area_id: Number(areaId) } : {}),
        ...(lat && lng ? { lat: Number(lat), lng: Number(lng) } : {}),
      });
      setSubmissionId((n) => n + 1);
      setServerErrors(result.fieldErrors ?? {});
      if (result.error || Object.keys(result.fieldErrors ?? {}).length > 0) {
        // A failed order must leave the cart, address, area and payment choice
        // intact so the customer can fix one field and retry. A NEW key is
        // issued for the retry, because the previous attempt did not produce an
        // order to return.
        attemptKey.current = newAttemptKey();
        setError(result.error);
        return;
      }
      // Cart is cleared ONLY after a confirmed, successful order.
      clearCart();
      router.push(`/customer/orders/${result.orderId}?placed=1`);
    });
  }

  /**
   * Cross-field rules the string rules cannot express. Each message is attached
   * to the control the customer would actually change.
   */
  const validateCheckout = useCallback((): FieldErrors => {
    const found: FieldErrors = {};
    if (fulfillment === "delivery") {
      if (!lat || !lng) found.lat = t("b1.deliveryLocationRequired");
      else if (coverage && !coverage.covered) found.lat = t("b1.deliveryUnavailable");
      const area = areas.find((a) => String(a.id) === areaId);
      if (area?.is_held) found.delivery_area_id = t("checkout.areaHeldNote");
    }
    return found;
  }, [areaId, areas, coverage, fulfillment, lat, lng, t]);

  const { errors, formProps } = useFormValidation(RULES, {
    validate: validateCheckout,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  // Placed AFTER every hook so the hook order never changes between renders.
  if (cart.items.length === 0) {
    return (
      <EmptyState
        title={t("orders.cartEmpty")}
        description={t("orders.cartEmptyCheckoutDesc")}
        action={<ButtonLink href="/customer/branches">{t("orders.viewRestaurants")}</ButtonLink>}
      />
    );
  }

  // Prefer the server quote; fall back to the client subtotal before a quote exists.
  const subtotal = quote?.subtotal ?? total;
  const deliveryCharge = quote?.delivery_charge ?? 0;
  const grandTotal = quote?.total ?? total;
  const minutes = (n: number | null | undefined) => (n != null ? t("checkout.minutes", { n: fmt.num(n) }) : "—");

  return (
    <form {...formProps} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Alert tone="error" message={error} />

        {prepMinutes != null ? (
          <p className="rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" data-testid="prep-estimate">
            ⏱ {t("b2.estimateBeforeOrder", { minutes: prepMinutes })}
          </p>
        ) : null}

        {/* B1 — delivery coverage check + nearest pickup */}
        <div className="rounded-xl border border-border-strong p-4" data-testid="coverage-panel">
          <p className="mb-2 text-sm font-medium text-fg-base">{t("b1.checkCoverageTitle")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("bmExtras.latLabel")} name="lat" error={errors.lat}>
              <Input name="lat" className="w-32" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} data-testid="cov-lat" placeholder="23.79" />
            </Field>
            <Field label={t("bmExtras.lngLabel")} name="lng" error={errors.lng}>
              <Input name="lng" className="w-32" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} data-testid="cov-lng" placeholder="90.41" />
            </Field>
            <Button type="button" variant="outline" size="sm" onClick={checkCoverage} disabled={checking} data-testid="cov-check">
              {checking ? t("common.saving") : t("b1.checkCoverage")}
            </Button>
          </div>
          {/* The coverage check's own message, below the controls it belongs to. */}
          <FieldError id="coverage-error" message={coverageError} />
          {coverage ? (
            coverage.covered ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="cov-covered">
                ✓ {t("b1.deliveryAvailable")} {coverage.delivery_fee > 0 ? `· ${t("b1.deliveryFee", { fee: coverage.delivery_fee })}` : ""}
              </p>
            ) : (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" data-testid="cov-pickup">
                <p className="font-medium">{t("b1.deliveryUnavailable")}</p>
                {coverage.nearest_pickup ? (
                  <div className="mt-2 space-y-0.5">
                    <p>{t("b1.nearestPickup", { branch: coverage.nearest_pickup.branch_name })}</p>
                    <p className="text-xs">{coverage.nearest_pickup.address}</p>
                    {coverage.nearest_pickup.distance_km != null ? <p className="text-xs">{t("b1.distance", { km: coverage.nearest_pickup.distance_km })}</p> : null}
                    {coverage.nearest_pickup.phone ? <p className="text-xs">📞 {coverage.nearest_pickup.phone}</p> : null}
                    {coverage.nearest_pickup.directions_url ? (
                      <a className="text-xs text-brand-600 underline" href={coverage.nearest_pickup.directions_url} target="_blank" rel="noreferrer">{t("b1.directions")}</a>
                    ) : null}
                    <label className="mt-1 flex items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={fulfillment === "pickup"} onChange={(e) => setFulfillment(e.target.checked ? "pickup" : "delivery")} data-testid="cov-pickup-opt" />
                      {t("b1.orderForPickup")}
                    </label>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </div>

        {/* #1/#6 — delivery-area selector (delivery only). Held areas disabled. */}
        {fulfillment === "delivery" ? (
          <Field
            label={t("checkout.deliveryArea")}
            name="delivery_area_id"
            hint={t("checkout.deliveryAreaHint")}
            error={errors.delivery_area_id}
          >
            <Select
              name="delivery_area_id"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              data-testid="area-select"
            >
              <option value="">{t("checkout.selectArea")}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id} disabled={a.is_held} data-testid={`area-option-${a.id}`}>
                  {a.is_held ? t("checkout.areaPaused", { name: a.name }) : a.name}
                </option>
              ))}
            </Select>
            {selectedArea?.is_held ? (
              <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="area-held-note">
                {t("checkout.areaHeldNote")}
              </p>
            ) : null}
          </Field>
        ) : null}

        <Field label={t("orders.deliveryAddress")} name="delivery_address" required error={errors.delivery_address}>
          <Textarea
            name="delivery_address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder={t("orders.addressPlaceholder")}
          />
        </Field>

        {/* One accessible group label + one message for the whole option set —
            never the same error repeated on every payment card. */}
        <FieldGroup
          label={t("orders.paymentMethod")}
          name="payment_method"
          required
          error={errors.payment_method}
        >
          <input type="hidden" name="payment_method" value={payment} />
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={payment === method}
                onClick={() => setPayment(method)}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-colors",
                  payment === method
                    ? "border-brand-500 bg-brand-50"
                    : "border-border-base bg-surface-card hover:border-border-strong",
                )}
              >
                <span className="text-xl">{method === "cash" ? "💵" : "📱"}</span>
                <p className="mt-1 font-semibold text-fg-base">{t(`payment.${method}`)}</p>
                <p className="text-xs text-fg-muted">
                  {method === "cash" ? t("orders.cashHint") : t("orders.bkashHint")}
                </p>
              </button>
            ))}
          </div>
        </FieldGroup>

        <Field label={t("orders.orderNote")} name="food_notes" error={errors.food_notes}>
          <Textarea
            name="food_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("orders.orderNotePlaceholder")}
          />
        </Field>

        <Field label={t("orders.couponCode")} name="coupon_code" error={errors.coupon_code}>
          <Input
            name="coupon_code"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder={t("orders.couponPlaceholder")}
            className="uppercase"
          />
        </Field>
      </div>

      {/* Order summary — every money/time value below is server-derived (req #6). */}
      <div className="h-fit rounded-2xl border border-border-base/80 bg-surface-card p-5 shadow-card" data-testid="order-summary">
        <h3 className="font-semibold text-fg-base">{t("checkout.summaryTitle")}</h3>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summaryBranch")}</dt>
            <dd className="text-right font-medium text-fg-base" data-testid="summary-branch">{quote?.branch.name ?? cart.branchName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summaryAddress")}</dt>
            <dd className="max-w-[60%] truncate text-right text-fg-base" data-testid="summary-address" title={address}>{address || "—"}</dd>
          </div>
          {fulfillment === "delivery" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("checkout.summaryArea")}</dt>
              <dd className="text-right text-fg-base" data-testid="summary-area">{quote?.area?.name ?? selectedArea?.name ?? "—"}</dd>
            </div>
          ) : null}
        </dl>

        <ul className="mt-3 space-y-2 border-t border-border-base pt-3 text-sm">
          {cart.items.map((item) => (
            <li key={`${item.productId}:${item.variationId ?? 0}`} className="flex justify-between gap-3">
              <span className="text-fg-muted">
                {item.name}{item.variationName ? ` · ${item.variationName}` : ""} × {fmt.num(item.quantity)}
              </span>
              <span className="font-medium text-fg-base">
                {fmt.money(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1.5 border-t border-border-base pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summarySubtotal")}</dt>
            <dd className="font-medium text-fg-base" data-testid="summary-subtotal">{fmt.money(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summaryDeliveryCharge")}</dt>
            <dd className="font-medium text-fg-base" data-testid="summary-delivery-charge">
              {fulfillment === "pickup" ? t("checkout.pickupNoCharge") : fmt.money(deliveryCharge)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summaryPrepTime")}</dt>
            <dd className="text-fg-base" data-testid="summary-prep">{minutes(quote?.prep_time_minutes ?? prepMinutes)}</dd>
          </div>
          {fulfillment === "delivery" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("checkout.summaryDeliveryTime")}</dt>
              <dd className="text-fg-base" data-testid="summary-delivery-estimate">{minutes(quote?.delivery_estimate_minutes)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">{t("checkout.summaryOverall")}</dt>
            <dd className="text-fg-base" data-testid="summary-overall-estimate">{minutes(quote?.overall_estimate_minutes ?? prepMinutes)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex justify-between border-t border-border-base pt-3">
          <span className="font-semibold text-fg-base">{t("checkout.summaryTotal")}</span>
          <span className="text-lg font-bold text-brand-600" data-testid="summary-total">{fmt.money(grandTotal)}</span>
        </div>
        {!quote ? (
          <p className="mt-2 text-xs text-fg-subtle" data-testid="quote-hint">{t("checkout.quoteHint")}</p>
        ) : null}
        <Button size="lg" type="submit" className="mt-4 w-full" disabled={pending} data-testid="place-order">
          {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
          {t("orders.confirmOrder")}
        </Button>
      </div>
    </form>
  );
}
