"use client";

import { useActionState, useMemo } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/forms/password-input";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { registerAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { required, email, phone, password as passwordRule, matches } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const initialState: AuthFormState = { error: null, fieldErrors: {} };

/** Optional NID/licence images — checked against the same limits the server uses. */
const RIDER_FILES = {
  nid_front_image: false,
  nid_back_image: false,
  license_image: false,
};

/** Shared registration form; `rolePath` picks the backend endpoint. */
export function RegisterForm({
  rolePath,
  withRiderFields = false,
}: {
  rolePath: string;
  withRiderFields?: boolean;
}) {
  const action = registerAction.bind(null, rolePath);
  const [state, formAction, pending] = useActionState(action, initialState);
  const { t } = useTranslation();

  const RULES: FieldRules = useMemo(
    () => ({
      first_name: [required],
      last_name: [required],
      username: [required],
      phone: [required, phone],
      email: [required, email],
      // Same policy the server enforces in validatePassword().
      password: [required, passwordRule],
      password_confirm: [required, matches("password")],
      ...(withRiderFields
        ? {
            nid_number: [required],
            vehicle_type: [required],
            emergency_contact_name: [required],
            emergency_contact_phone: [required, phone],
          }
        : {}),
    }),
    [withRiderFields],
  );
  const files = useMemo(() => (withRiderFields ? RIDER_FILES : {}), [withRiderFields]);

  const { errors, formProps } = useFormValidation(RULES, {
    files,
    // Duplicate username/email/phone come back keyed by field and land below it.
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <Alert tone="error" message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("auth.firstName")} required error={errors.first_name}>
          <Input name="first_name" required aria-invalid={!!errors.first_name} placeholder={t("register.firstNamePlaceholder")} />
        </Field>
        <Field label={t("auth.lastName")} required error={errors.last_name}>
          <Input name="last_name" required aria-invalid={!!errors.last_name} placeholder={t("register.lastNamePlaceholder")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("auth.usernameLabel")} required error={errors.username}>
          <Input name="username" required aria-invalid={!!errors.username} autoComplete="username" placeholder="username" />
        </Field>
        <Field label={t("register.phoneNumber")} required hint={t("auth.phoneHint")} error={errors.phone}>
          <Input name="phone" required aria-invalid={!!errors.phone} placeholder="01XXXXXXXXX" />
        </Field>
      </div>

      <Field label={t("common.email")} required error={errors.email}>
        <Input name="email" type="email" required aria-invalid={!!errors.email} placeholder="email@example.com" />
      </Field>

      <Field label={t("register.addressLabel")}>
        <Textarea name="address" rows={2} placeholder={t("register.currentAddressPlaceholder")} />
      </Field>

      {withRiderFields ? (
        <fieldset className="space-y-4 rounded-2xl border border-border-base p-4">
          <legend className="px-2 text-sm font-semibold text-fg-base">{t("register.riderInfo")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("register.nidNumber")} required error={errors.nid_number}>
              <Input name="nid_number" required aria-invalid={!!errors.nid_number} placeholder={t("register.nidPlaceholder")} />
            </Field>
            <Field label={t("register.vehicleType")} required error={errors.vehicle_type}>
              <Input name="vehicle_type" required aria-invalid={!!errors.vehicle_type} placeholder={t("register.vehiclePlaceholder")} />
            </Field>
            <Field label={t("register.drivingLicense")}>
              <Input name="driving_license_number" placeholder={t("register.licensePlaceholder")} />
            </Field>
            <Field label={t("register.bikeReg")}>
              <Input name="bike_registration_number" placeholder={t("register.bikeRegPlaceholder")} />
            </Field>
            <Field label={t("register.bloodGroup")}>
              <Input name="blood_group" placeholder="O+" />
            </Field>
            <Field label={t("register.education")}>
              <Input name="education" placeholder={t("register.educationHint")} />
            </Field>
            <Field label={t("register.emergencyName")} required error={errors.emergency_contact_name}>
              <Input name="emergency_contact_name" required aria-invalid={!!errors.emergency_contact_name} placeholder={t("register.emergencyNamePlaceholder")} />
            </Field>
            <Field label={t("register.emergencyPhone")} required error={errors.emergency_contact_phone}>
              <Input name="emergency_contact_phone" required aria-invalid={!!errors.emergency_contact_phone} placeholder="01XXXXXXXXX" />
            </Field>
          </div>
          <Field label={t("register.presentAddress")}>
            <Textarea name="present_address" rows={2} />
          </Field>
          <Field label={t("register.permanentAddress")}>
            <Textarea name="permanent_address" rows={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("register.nidFront")} name="nid_front_image" error={errors.nid_front_image}>
              <Input name="nid_front_image" type="file" accept="image/*" className="py-2" />
            </Field>
            <Field label={t("register.nidBack")} name="nid_back_image" error={errors.nid_back_image}>
              <Input name="nid_back_image" type="file" accept="image/*" className="py-2" />
            </Field>
            <Field label={t("register.licenseImage")} name="license_image" error={errors.license_image}>
              <Input name="license_image" type="file" accept="image/*" className="py-2" />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("auth.passwordLabel")} required hint={t("auth.passwordHint")} error={errors.password}>
          <PasswordInput name="password" required aria-invalid={!!errors.password} autoComplete="new-password" />
        </Field>
        <Field label={t("auth.confirmPassword")} required error={errors.password_confirm}>
          <PasswordInput name="password_confirm" required aria-invalid={!!errors.password_confirm} autoComplete="new-password" />
        </Field>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
        {t("auth.registerButton")}
      </Button>
    </form>
  );
}
