import type { Prisma } from "@prisma/client";

import { requireApiUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { handle, sk, validationError } from "@/lib/http/errors";
import { deleteUpload, isUploadedFile, saveUpload } from "@/lib/http/upload";
import { json } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";
import { maybeAwardProfileComplete } from "@/lib/services/rewards";
import { assertPhoneAvailable } from "@/lib/services/users";
import {
  validateDate,
  validateEmail,
  validateEnum,
  validateImage,
  validatePhone,
  validateRequired,
} from "@/lib/validation/server";

const GENDERS = ["male", "female", "other"] as const;

/** Shared by both body shapes so JSON and multipart enforce identical rules. */
function normalizeGender(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return value === "" ? "" : undefined;
  return validateEnum(value, "gender", GENDERS);
}

/** Date of birth may not be in the future. */
function normalizeDob(value: string): Date {
  const iso = validateDate(value, "date_of_birth");
  const parsed = new Date(iso);
  if (parsed.getTime() > Date.now()) {
    throw validationError({ date_of_birth: sk("validation.dateFuture") });
  }
  return parsed;
}

// GET /api/auth/profile — own profile.
export const GET = handle(async () => {
  const me = await requireApiUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { approvedBy: true } });
  return json(serializeUser(user));
});

// PATCH /api/auth/profile — update own profile (incl. photo upload, multipart or JSON).
export const PATCH = handle(async (req: Request) => {
  const me = await requireApiUser();
  const contentType = req.headers.get("content-type") ?? "";
  const data: Prisma.UserUpdateInput = {};

  const setStr = (key: keyof Prisma.UserUpdateInput, value: string | undefined) => {
    if (value !== undefined) (data as Record<string, unknown>)[key] = value;
  };

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const firstName = form.get("first_name")?.toString();
    const lastName = form.get("last_name")?.toString();
    if (firstName !== undefined) setStr("firstName", validateRequired(firstName, "first_name"));
    if (lastName !== undefined) setStr("lastName", validateRequired(lastName, "last_name"));
    setStr("address", form.get("address")?.toString());
    setStr("gender", normalizeGender(form.get("gender")?.toString()));

    const email = form.get("email")?.toString();
    if (email !== undefined) {
      const normalized = validateEmail(email);
      const exists = await prisma.user.findFirst({
        where: { email: { equals: normalized }, id: { not: me.id } },
      });
      if (exists) throw validationError({ email: sk("errors.auth.emailTaken") });
      data.email = normalized;
    }
    const phone = form.get("phone")?.toString();
    if (phone) {
      await assertPhoneAvailable(phone, me.id);
      data.phone = validatePhone(phone);
    }

    const dob = form.get("date_of_birth")?.toString();
    if (dob) data.dateOfBirth = normalizeDob(dob);

    const photo = form.get("profile_photo");
    if (isUploadedFile(photo)) {
      // Re-checked here: the browser's `accept` filter is not a security control.
      validateImage(photo, "profile_photo");
      data.profilePhoto = await saveUpload(photo, "profile_photos", "profile_photo");
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.first_name !== undefined) {
      setStr("firstName", validateRequired(body.first_name, "first_name"));
    }
    if (body.last_name !== undefined) {
      setStr("lastName", validateRequired(body.last_name, "last_name"));
    }
    setStr("address", body.address as string | undefined);
    setStr("gender", normalizeGender(body.gender as string | undefined));
    if (typeof body.email === "string") {
      const normalized = validateEmail(body.email);
      const exists = await prisma.user.findFirst({
        where: { email: normalized, id: { not: me.id } },
      });
      if (exists) throw validationError({ email: sk("errors.auth.emailTaken") });
      data.email = normalized;
    }
    if (typeof body.phone === "string" && body.phone) {
      await assertPhoneAvailable(body.phone, me.id);
      data.phone = validatePhone(body.phone);
    }
    if (typeof body.date_of_birth === "string" && body.date_of_birth) {
      data.dateOfBirth = normalizeDob(body.date_of_birth);
    }
  }

  await prisma.user.update({ where: { id: me.id }, data });
  // Replaced the photo → best-effort delete the previous file from storage.
  if (typeof data.profilePhoto === "string" && me.profilePhoto && me.profilePhoto !== data.profilePhoto) {
    await deleteUpload(me.profilePhoto);
  }
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { approvedBy: true } });
  // Completing the profile earns reward coins (customers only, once).
  if (fresh.role === "customer") await maybeAwardProfileComplete(fresh);
  return json(serializeUser(fresh));
});
