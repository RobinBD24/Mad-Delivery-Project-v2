"use client";

import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initialActionState } from "@/lib/api/action-state";
import { updateProfileAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { mediaUrl } from "@/lib/utils";
import { IMAGE_MIME_TYPES, imageFileProblem } from "@/lib/validation/limits";
import { email, notFuture, oneOf, phone, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import type { User } from "@/types";

const GENDERS = ["male", "female", "other"] as const;

const RULES: FieldRules = {
  first_name: [required],
  last_name: [required],
  email: [required, email],
  phone: [phone],
  date_of_birth: [notFuture],
  gender: [oneOf(["", ...GENDERS])],
};

/** The photo is optional — checked against the same limits the server applies. */
const FILES = { profile_photo: false };

export function ProfileForm({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialActionState);
  const { t } = useTranslation();
  // A duplicate email/phone comes back keyed by field and lands under it.
  const { errors, formProps } = useFormValidation(RULES, {
    files: FILES,
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });
  const [preview, setPreview] = useState<string | null>(
    mediaUrl(user.profile_photo, user.updated_at),
  );
  const [imgFailed, setImgFailed] = useState(false);

  // Show the success alert only when there are no outstanding field errors, so
  // a stale success never renders next to a new validation error.
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <Alert tone="error" message={state.error} />
      {!hasFieldErrors ? <Alert tone="success" message={state.success} /> : null}

      <div className="flex items-center gap-4">
        {preview && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={user.full_name || user.username}
            width={72}
            height={72}
            className="size-18 rounded-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="flex size-18 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
            {(user.full_name || user.username).charAt(0).toUpperCase()}
          </span>
        )}
        <Field
          label={t("profile.profilePhoto")}
          name="profile_photo"
          className="flex-1"
          error={errors.profile_photo}
        >
          <Input
            name="profile_photo"
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            className="py-2"
            onChange={(e) => {
              // The chosen file STAYS in the input whatever happens — the hook
              // validates it (same MIME/size limits as the server) and blocks
              // the submit, so the user can see and replace exactly what failed.
              const file = e.target.files?.[0];
              if (!file) {
                setPreview(mediaUrl(user.profile_photo, user.updated_at));
                return;
              }
              setImgFailed(false);
              // Preview only a usable image; an invalid one keeps the saved photo
              // on screen so nothing appears to have been lost.
              setPreview(
                imageFileProblem(file)
                  ? mediaUrl(user.profile_photo, user.updated_at)
                  : URL.createObjectURL(file),
              );
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("auth.firstName")} required error={errors.first_name}>
          <Input
            name="first_name"
            required
            defaultValue={user.first_name}
            aria-invalid={!!errors.first_name}
          />
        </Field>
        <Field label={t("auth.lastName")} required error={errors.last_name}>
          <Input
            name="last_name"
            required
            defaultValue={user.last_name}
            aria-invalid={!!errors.last_name}
          />
        </Field>
        <Field label={t("common.email")} required error={errors.email}>
          <Input
            name="email"
            type="email"
            required
            defaultValue={user.email}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field label={t("common.phone")} error={errors.phone}>
          <Input
            name="phone"
            defaultValue={user.phone ?? ""}
            placeholder="01XXXXXXXXX"
            aria-invalid={!!errors.phone}
          />
        </Field>
        <Field label={t("profile.dateOfBirth")} name="date_of_birth" error={errors.date_of_birth}>
          <Input name="date_of_birth" type="date" defaultValue={user.date_of_birth ?? ""} />
        </Field>
        <Field label={t("profile.gender")} name="gender" error={errors.gender}>
          <Select name="gender" defaultValue={user.gender ?? ""}>
            <option value="">{t("profile.selectPlaceholder")}</option>
            <option value="male">{t("profile.male")}</option>
            <option value="female">{t("profile.female")}</option>
            <option value="other">{t("profile.other")}</option>
          </Select>
        </Field>
      </div>

      <Field label={t("common.address")}>
        <Textarea name="address" defaultValue={user.address ?? ""} rows={2} />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
        {t("profile.updateProfile")}
      </Button>
    </form>
  );
}
