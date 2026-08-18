"use client";

import { useActionState, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/forms/password-input";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/api/action-state";
import { saveUserAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import {
  email,
  notFuture,
  oneOf,
  password as passwordRule,
  phone as phoneRule,
  required,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { Role, User, UserStatus } from "@/types";

const initial: ActionState = { error: null, fieldErrors: {} };

const ROLE_VALUES = Object.keys(ROLE_LABELS) as Role[];
const STATUS_VALUES = Object.keys(STATUS_LABELS) as UserStatus[];
const GENDERS = ["", "male", "female", "other"];
const FILES = { profile_photo: false };

/**
 * Create/edit form for the super admin user-management screen.
 * Create → any role + initial status + password + optional rider profile.
 * Edit   → profile fields + role; password optional; status via approve/reject.
 */
export function UserForm({ user }: { user?: User }) {
  const { t } = useTranslation();
  const isEdit = Boolean(user);
  const action = saveUserAction.bind(null, user?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initial);
  const [role, setRole] = useState<Role>(user?.role ?? "customer");

  const RULES: FieldRules = useMemo(
    () => ({
      role: [required, oneOf(ROLE_VALUES)],
      first_name: [required],
      last_name: [required],
      email: [required, email],
      phone: [phoneRule],
      date_of_birth: [notFuture],
      gender: [oneOf(GENDERS)],
      // On edit an empty password means "leave it unchanged"; a typed one must
      // still satisfy the same policy the server enforces.
      password: isEdit ? [passwordRule] : [required, passwordRule],
      ...(isEdit ? {} : { username: [required], status: [required, oneOf(STATUS_VALUES)] }),
      ...(role === "rider" && !isEdit ? { emergency_contact_phone: [phoneRule] } : {}),
    }),
    [isEdit, role],
  );
  // Duplicate username/email/phone come back keyed by field → shown below it.
  const { errors, formProps } = useFormValidation(RULES, {
    files: FILES,
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} {...formProps} className="space-y-5">
      <Alert tone="error" message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.role")} name="role" required error={errors.role}>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {t("roles." + r)}
              </option>
            ))}
          </Select>
        </Field>
        {!isEdit ? (
          <Field label={t("common.status")} name="status" required error={errors.status}>
            <Select name="status" defaultValue="approved">
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {t("userStatus." + s)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("users.firstName")} required error={errors.first_name}>
          <Input name="first_name" required aria-invalid={!!errors.first_name} defaultValue={user?.first_name} placeholder={t("users.firstName")} />
        </Field>
        <Field label={t("users.lastName")} required error={errors.last_name}>
          <Input name="last_name" required aria-invalid={!!errors.last_name} defaultValue={user?.last_name} placeholder={t("users.lastName")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("users.username")} required hint={isEdit ? t("users.usernameHint") : undefined} error={errors.username}>
          <Input
            name="username"
            required={!isEdit}
            aria-invalid={!!errors.username}
            defaultValue={user?.username}
            disabled={isEdit}
            autoComplete="off"
            placeholder="username"
          />
        </Field>
        <Field label={t("common.phone")} name="phone" hint={t("users.phoneHint")} error={errors.phone}>
          <Input name="phone" defaultValue={user?.phone} placeholder="01XXXXXXXXX" />
        </Field>
      </div>

      <Field label={t("common.email")} required error={errors.email}>
        <Input name="email" type="email" required aria-invalid={!!errors.email} defaultValue={user?.email} placeholder="email@example.com" />
      </Field>

      <Field label={t("common.address")}>
        <Textarea name="address" rows={2} defaultValue={user?.address} placeholder={t("common.address")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("users.dateOfBirth")} name="date_of_birth" error={errors.date_of_birth}>
          <Input name="date_of_birth" type="date" defaultValue={user?.date_of_birth ?? ""} />
        </Field>
        <Field label={t("users.gender")} name="gender" error={errors.gender}>
          <Select name="gender" defaultValue={user?.gender ?? ""}>
            <option value="">—</option>
            <option value="male">{t("users.male")}</option>
            <option value="female">{t("users.female")}</option>
            <option value="other">{t("users.other")}</option>
          </Select>
        </Field>
      </div>

      <Field label={t("users.profilePhoto")} name="profile_photo" error={errors.profile_photo}>
        <Input name="profile_photo" type="file" accept="image/*" className="py-2" />
      </Field>

      <Field
        label={isEdit ? t("users.newPassword") : t("users.password")}
        required={!isEdit}
        hint={isEdit ? t("users.passwordEditHint") : t("users.passwordHint")}
        error={errors.password}
      >
        <PasswordInput name="password" required={!isEdit} aria-invalid={!!errors.password} autoComplete="new-password" />
      </Field>

      {role === "rider" && !isEdit ? (
        <fieldset className="space-y-4 rounded-2xl border border-border-base p-4">
          <legend className="px-2 text-sm font-semibold text-fg-base">{t("users.riderInfoOptional")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("users.nidNumber")}>
              <Input name="nid_number" placeholder={t("users.nidPlaceholder")} />
            </Field>
            <Field label={t("users.vehicleType")}>
              <Input name="vehicle_type" placeholder={t("users.vehiclePlaceholder")} />
            </Field>
            <Field label={t("users.drivingLicense")}>
              <Input name="driving_license_number" />
            </Field>
            <Field label={t("users.bikeReg")}>
              <Input name="bike_registration_number" />
            </Field>
            <Field label={t("users.bloodGroup")}>
              <Input name="blood_group" placeholder="O+" />
            </Field>
            <Field label={t("users.emergencyName")}>
              <Input name="emergency_contact_name" />
            </Field>
            <Field
              label={t("users.emergencyPhone")}
              name="emergency_contact_phone"
              error={errors.emergency_contact_phone}
            >
              <Input name="emergency_contact_phone" placeholder="01XXXXXXXXX" />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
        {isEdit ? t("common.update") : t("users.createUser")}
      </Button>
    </form>
  );
}
