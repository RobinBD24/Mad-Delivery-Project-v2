"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import Image from "next/image";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initialActionState } from "@/lib/api/action-state";
import { saveProductAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { mediaUrl } from "@/lib/utils";
import { FormError } from "@/components/ui/field-error";
import { FormSection } from "@/components/catalog/form-section";
import { LIMITS, MAX_IMAGE_MB } from "@/lib/validation/limits";
import {
  integer,
  max,
  maxLength,
  min,
  money,
  number,
  oneOf,
  required,
  selectRequired,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import type { FieldErrors } from "@/lib/validation/contract";
import type { Category, Product } from "@/types";

const VARIATION_TYPES = ["THICK", "THIN", "BOTH"];

const RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  category: [selectRequired], // req #10 — category selection is mandatory
  variation_type: [required, oneOf(VARIATION_TYPES)],
  description: [maxLength(LIMITS.longTextMax)],
  discount: [number, min(LIMITS.percentMin), max(LIMITS.percentMax)],
  preparation_time: [required, integer, min(LIMITS.minutesMin), max(LIMITS.minutesMax)],
};

const FILES = { image: false };

const PRODUCT_BRANDS = ["cheez", "madchef"] as const;

export interface BranchOption {
  id: number;
  name: string;
  brand_type: string;
}

interface VariationRow {
  id?: number;
  /** Stable React key — survives adding/removing rows so errors never shift. */
  rowKey: string;
  name: string;
  size_label: string;
  price: string;
  compare_at_price: string;
  serving_info: string;
  variant_type: string;
  is_enabled: boolean;
  is_default: boolean;
}

let rowKeySeq = 0;
const nextRowKey = () => `row-${(rowKeySeq += 1)}`;

function blankVariation(isDefault = false): VariationRow {
  return {
    rowKey: nextRowKey(),
    name: "",
    size_label: "",
    price: "",
    compare_at_price: "",
    serving_info: "",
    variant_type: "",
    is_enabled: true,
    is_default: isDefault,
  };
}

function rowsFromProduct(product?: Product): VariationRow[] {
  if (product && product.variations.length) {
    return product.variations.map((v) => ({
      id: v.id,
      rowKey: `saved-${v.id}`,
      name: v.name,
      size_label: v.size_label,
      price: v.price,
      compare_at_price: v.compare_at_price ?? "",
      serving_info: v.serving_info,
      variant_type: v.variant_type,
      is_enabled: v.is_enabled,
      is_default: v.is_default,
    }));
  }
  return [blankVariation(true)];
}

export function ProductForm({
  product,
  categories,
  basePath,
  branches,
  fixedBranch,
}: {
  product?: Product;
  categories: Category[];
  basePath: string;
  /** Present when the user must pick a branch (super-admin create). */
  branches?: BranchOption[];
  /** Present when the branch is implicit (branch manager, or edit). */
  fixedBranch?: BranchOption;
  /**
   * Retained (optional) for backward compatibility with callers; the "create a
   * category" empty-state was removed (req #10) so it is no longer rendered.
   */
  categoryCreateHref?: string;
}) {
  const { t, fmt } = useTranslation();
  const action = saveProductAction.bind(null, product?.id ?? null, basePath);
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [preview, setPreview] = useState<string | null>(mediaUrl(product?.image ?? null));

  const [branchId, setBranchId] = useState<number | null>(
    fixedBranch?.id ?? product?.branch ?? branches?.[0]?.id ?? null,
  );
  const [rows, setRows] = useState<VariationRow[]>(() => rowsFromProduct(product));
  const [brand, setBrand] = useState<string>(product?.brand ?? "");

  const activeBranch: BranchOption | undefined = useMemo(() => {
    if (fixedBranch) return fixedBranch;
    return branches?.find((b) => b.id === branchId);
  }, [fixedBranch, branches, branchId]);

  const brandType = activeBranch?.brand_type ?? "combined";
  const soleBrand = brandType === "cheez" ? "cheez" : brandType === "madchef" ? "madchef" : null;
  // req #8/#10 — a branch's eligible categories = its own PLUS every global
  // (branch === null) category. Categories assigned to OTHER branches are hidden.
  const branchCategories = useMemo(
    () => categories.filter((c) => c.branch === null || (branchId != null && c.branch === branchId)),
    [categories, branchId],
  );

  // ── Variation mutations ────────────────────────────────────────────
  const setRow = (i: number, patch: Partial<VariationRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () => setRows((prev) => [...prev, blankVariation(prev.every((r) => !r.is_default))]);

  const removeRow = (i: number) =>
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, idx) => idx !== i);
      if (!next.some((r) => r.is_default && r.is_enabled)) {
        const firstEnabled = next.findIndex((r) => r.is_enabled);
        if (firstEnabled >= 0) next[firstEnabled] = { ...next[firstEnabled], is_default: true };
      }
      return next;
    });

  const makeDefault = (i: number) =>
    setRows((prev) => prev.map((r, idx) => ({ ...r, is_default: idx === i })));

  const toggleEnabled = (i: number, on: boolean) =>
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, is_enabled: on, is_default: on && r.is_default } : r));
      if (!next.some((r) => r.is_default && r.is_enabled)) {
        const firstEnabled = next.findIndex((r) => r.is_enabled);
        if (firstEnabled >= 0) next[firstEnabled] = { ...next[firstEnabled], is_default: true };
      }
      return next;
    });

  // Serialized payload sent to the API (validated again server-side).
  const variationsJson = JSON.stringify(
    rows.map((r, i) => ({
      id: r.id,
      name: r.name.trim(),
      sizeLabel: r.size_label.trim(),
      price: r.price === "" ? 0 : Number(r.price),
      compareAtPrice: r.compare_at_price === "" ? null : Number(r.compare_at_price),
      servingInfo: r.serving_info.trim(),
      variantType: r.variant_type.trim(),
      sortOrder: i,
      isDefault: r.is_default,
      isEnabled: r.is_enabled,
    })),
  );

  /**
   * Repeated-row validation. Every row is checked independently and each
   * message is keyed by its STRUCTURED PATH (`variations.0.price`) so it renders
   * under that exact input — one bad row never hides the others and never
   * removes a valid row. The whole-list rule ("at least one enabled") is keyed
   * `variations` and shown once under the section.
   */
  const validateVariations = useCallback((): FieldErrors => {
    const found: FieldErrors = {};
    if (rows.length === 0) {
      found.variations = t("catalog.variationsRequired");
      return found;
    }
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const name = r.name.trim();
      if (!name) {
        found[`variations.${i}.name`] = t("catalog.variationNameRequired");
      } else {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          found[`variations.${i}.name`] = t("catalog.variationNameDuplicate");
        } else {
          seen.set(key, i);
        }
      }
      const priceError = money(r.price, {});
      if (r.price.trim() === "") {
        found[`variations.${i}.price`] = t("validation.required");
      } else if (priceError) {
        found[`variations.${i}.price`] = t(priceError.key, priceError.vars);
      }
      if (r.compare_at_price.trim() !== "") {
        const compareError = money(r.compare_at_price, {});
        if (compareError) {
          found[`variations.${i}.compare_at_price`] = t(compareError.key, compareError.vars);
        }
      }
    });
    if (!rows.some((r) => r.is_enabled)) {
      found.variations = t("catalog.variationOneEnabledRequired");
    }
    return found;
  }, [rows, t]);

  const { errors, formProps } = useFormValidation(RULES, {
    files: FILES,
    validate: validateVariations,
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    // The form itself used to be `max-w-3xl`, which is what left the right-hand
    // third of the page empty even after the card around it was widened. It now
    // fills the content column and splits in two: the long-running work (name,
    // description, variations) on the left, the short decisions (where it is
    // sold, price, image, visibility, save) in a sidebar on the right. Below
    // `lg` the columns collapse to one, sidebar last, so nothing is squeezed.
    <form action={formAction} className="space-y-4" {...formProps}>
      <Alert tone="error" message={state.error} />

      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-8">
          <FormSection title={t("catalog.sectionBasicInfo")}>
            {/* Two thirds of the card: a product name is one short line, and a
                full-bleed input across the main column reads as unfinished. */}
            <div className="sm:grid sm:grid-cols-3">
              <Field
                className="sm:col-span-2"
                label={t("catalog.productName")}
                required
                error={errors.name}
              >
                <Input
                  name="name"
                  required
                  aria-invalid={!!errors.name}
                  defaultValue={product?.name}
                  placeholder={t("catalog.productNamePlaceholder")}
                />
              </Field>
            </div>
            <Field label={t("catalog.description")} name="description" error={errors.description}>
              <Textarea name="description" defaultValue={product?.description} rows={4} />
            </Field>
          </FormSection>

          <FormSection
            title={t("catalog.variations")}
            description={t("catalog.variationsHint")}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addRow}
                className="max-sm:w-full"
              >
                + {t("catalog.addVariation")}
              </Button>
            }
          >
            {/* Whole-list rule (e.g. "keep at least one enabled"), shown once. */}
            <FormError message={errors.variations} />

            {rows.map((r, i) => (
              // `rowKey` is stable across re-orders/removals so React never
              // re-uses one row's DOM (and its error) for a different row.
              <div
                key={r.rowKey}
                className="rounded-xl border border-border-base bg-surface-muted/50 p-3.5"
                data-testid="variation-row"
              >
                {/* A number, so two rows are never confused for one another and
                    an error can be pointed at out loud. */}
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {t("catalog.variationNumber", { n: fmt.num(i + 1) })}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field
                    label={t("catalog.variationName")}
                    name={`variations.${i}.name`}
                    required
                    error={errors[`variations.${i}.name`]}
                  >
                    <Input
                      name={`variations.${i}.name`}
                      value={r.name}
                      data-testid="variation-name"
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      placeholder={t("catalog.variationNamePlaceholder")}
                    />
                  </Field>
                  <Field label={t("catalog.variationSize")}>
                    <Input value={r.size_label} onChange={(e) => setRow(i, { size_label: e.target.value })} />
                  </Field>
                  <Field
                    label={t("catalog.priceTk")}
                    name={`variations.${i}.price`}
                    required
                    error={errors[`variations.${i}.price`]}
                  >
                    <Input
                      name={`variations.${i}.price`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.price}
                      data-testid="variation-price"
                      onChange={(e) => setRow(i, { price: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={t("catalog.compareAtPrice")}
                    name={`variations.${i}.compare_at_price`}
                    error={errors[`variations.${i}.compare_at_price`]}
                  >
                    <Input
                      name={`variations.${i}.compare_at_price`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.compare_at_price}
                      onChange={(e) => setRow(i, { compare_at_price: e.target.value })}
                    />
                  </Field>
                  <Field label={t("catalog.servingInfo")}>
                    <Input value={r.serving_info} onChange={(e) => setRow(i, { serving_info: e.target.value })} />
                  </Field>
                  <Field label={t("catalog.variantType")}>
                    <Input value={r.variant_type} onChange={(e) => setRow(i, { variant_type: e.target.value })} />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border-base pt-2.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="__default"
                      checked={r.is_default}
                      disabled={!r.is_enabled}
                      onChange={() => makeDefault(i)}
                    />
                    {t("catalog.variationDefault")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={r.is_enabled}
                      data-testid="variation-enabled"
                      onChange={(e) => toggleEnabled(i, e.target.checked)}
                    />
                    {t("catalog.variationEnabled")}
                  </label>
                  {/* Destructive, but not louder than the fields it removes —
                      and it stays inside its own variation card. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-600 dark:text-red-400"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              </div>
            ))}
          </FormSection>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-4">
          <FormSection title={t("catalog.sectionOrganization")}>
            {branches ? (
              <Field label={t("catalog.branch")} name="branch_id" required error={errors.branch_id}>
                <Select
                  name="branch_id"
                  value={branchId ?? ""}
                  onChange={(e) => {
                    setBranchId(Number(e.target.value));
                    setBrand("");
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={t("catalog.branch")}>
                <Input value={fixedBranch?.name ?? product?.branch_name ?? ""} disabled readOnly />
              </Field>
            )}

            {soleBrand ? (
              <input type="hidden" name="brand" value={soleBrand} />
            ) : (
              <Field label={t("catalog.brand")} name="brand" required error={errors.brand}>
                <Select name="brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">{t("catalog.selectBrand")}</option>
                  {PRODUCT_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {t(`brands.${b}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label={t("catalog.category")} required error={errors.category}>
              {branchCategories.length ? (
                <Select
                  name="category"
                  defaultValue={product?.category ?? ""}
                  aria-invalid={errors.category ? true : undefined}
                >
                  <option value="">{t("catalog.selectCategory")}</option>
                  {branchCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.is_global ? ` · ${t("catalog.globalCategory")}` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                // req #10 — no create-category action for a branch manager; a
                // neutral message directs them to the super admin instead.
                <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-fg-muted">
                  {t("catalog.noCategoriesContactAdmin")}
                </p>
              )}
            </Field>

            {/* req #4 — MANDATORY product variation (crust) type. Stable internal
                values are submitted; the visible labels are translated. */}
            <Field
              label={t("variationType.label")}
              required
              hint={t("variationType.hint")}
              error={errors.variation_type}
            >
              <Select
                name="variation_type"
                defaultValue={product?.variation_type ?? "THICK"}
                required
                aria-invalid={errors.variation_type ? true : undefined}
                data-testid="product-variation-type"
              >
                <option value="THICK">{t("variationType.THICK")}</option>
                <option value="THIN">{t("variationType.THIN")}</option>
                <option value="BOTH">{t("variationType.BOTH")}</option>
              </Select>
            </Field>
          </FormSection>

          <FormSection title={t("catalog.sectionPricing")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("catalog.discount")} name="discount" error={errors.discount}>
                <Input
                  name="discount"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={product?.discount ?? "0"}
                />
              </Field>
              <Field label={t("catalog.prepTime")} name="preparation_time" error={errors.preparation_time}>
                <Input
                  name="preparation_time"
                  type="number"
                  min="1"
                  defaultValue={product?.preparation_time ?? 20}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("catalog.sectionImage")}>
            {/* Leaving the file input empty on edit keeps the saved image — it is
                never cleared by an unrelated validation error elsewhere. */}
            <Field
              label={t("catalog.image")}
              name="image"
              hint={product?.image ? t("catalog.imageKeepHint") : t("catalog.imageFormatsHint", { n: MAX_IMAGE_MB })}
              error={errors.image}
            >
              <div className="flex items-center gap-3">
                {preview ? (
                  <Image
                    src={preview}
                    alt={t("catalog.preview")}
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-xl border border-border-base object-cover"
                    unoptimized
                  />
                ) : null}
                <Input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="min-w-0 py-2"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setPreview(file ? URL.createObjectURL(file) : mediaUrl(product?.image ?? null));
                  }}
                />
              </div>
            </Field>
          </FormSection>

          <FormSection title={t("catalog.sectionVisibility")} contentClassName="space-y-2.5">
            <Checkbox
              name="is_available"
              label={t("catalog.available")}
              defaultChecked={product?.is_available ?? true}
            />
            <Checkbox
              name="is_popular"
              label={t("catalog.popular")}
              defaultChecked={product?.is_popular ?? false}
            />
            <Checkbox
              name="is_recommended"
              label={t("catalog.recommended")}
              defaultChecked={product?.is_recommended ?? false}
            />
          </FormSection>

          {/* Save sits at the foot of the sidebar on desktop and at the foot of
              the single column on mobile — a normal section, not a fixed bar
              that would cover the fields being edited. */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border-base bg-surface-card p-4 shadow-[var(--dashboard-shadow-panel)] sm:flex-row lg:flex-col">
            <Button type="submit" disabled={pending} className="sm:flex-1 lg:w-full">
              {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
              {product ? t("catalog.saveChanges") : t("catalog.addProduct")}
            </Button>
            <ButtonLink href={basePath} variant="outline" className="sm:flex-1 lg:w-full">
              {t("common.cancel")}
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* Serialized variation payload */}
      <input type="hidden" name="variations" value={variationsJson} />
    </form>
  );
}
