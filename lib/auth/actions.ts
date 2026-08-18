"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { auth, signIn, signOut } from "@/auth";
import { ApiError, sendForm } from "@/lib/api/client";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { loginDestination } from "@/lib/auth/login-destination";
import { isValidPhone } from "@/lib/validation/server";
import type { Role } from "@/types";

export interface AuthFormState {
  /** Form-level message (bad credentials, blocked account, unexpected error). */
  error: string | null;
  /** field name → message, rendered under that field by useFormValidation. */
  fieldErrors?: FieldErrors;
  code?: string;
  /** Changes on every server response so repeat failures re-trigger effects. */
  submissionId?: number;
}

/** Failure carrying per-field messages. */
function authFieldErrors(fieldErrors: FieldErrors, formError: string | null = null): AuthFormState {
  return { error: formError, fieldErrors, submissionId: Date.now() };
}

/** Failure that belongs to the form as a whole, not to one field. */
function authFormError(message: string, code?: string): AuthFormState {
  return { error: message, fieldErrors: {}, code, submissionId: Date.now() };
}

/**
 * Login: validate credentials + approval status ourselves (so we can surface
 * pending/rejected reasons), then establish the NextAuth session via signIn.
 *
 * The single `identifier` field accepts EITHER a BD mobile number or a
 * username: a value matching the phone format is resolved to its account by
 * phone, anything else is treated as a username. Staff/demo accounts therefore
 * keep working while customers can sign in with the mobile number they
 * registered with.
 */
export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = String(formData.get("remember") ?? "") === "on";
  const callbackUrl = String(formData.get("callbackUrl") ?? "");
  const { t } = await getT();

  // Missing values are the user's own field mistakes — reported under the field.
  const missing: FieldErrors = {};
  if (!identifier) missing.identifier = t("validation.required");
  if (!password) missing.password = t("validation.required");
  if (Object.keys(missing).length > 0) return authFieldErrors(missing);

  // Mobile number → look the account up by phone; otherwise by username.
  const user = isValidPhone(identifier)
    ? await prisma.user.findFirst({ where: { phone: identifier } })
    : await prisma.user.findUnique({ where: { username: identifier } });

  const passwordOk = user ? await bcrypt.compare(password, user.password) : false;
  // Deliberately form-level: never reveal WHICH of the two was wrong.
  if (!user || !passwordOk || !user.isActive) {
    return authFormError(t("errors.invalidCredentials"));
  }
  if (user.status === "pending") {
    return authFormError(t("errors.auth.accountPending"), "pending");
  }
  if (user.status === "rejected") {
    return authFormError(
      t("errors.auth.accountRejected", {
        reason: user.rejectionReason || t("errors.auth.notSpecified"),
      }),
      "rejected",
    );
  }

  try {
    // Always sign in by the resolved username — the provider's lookup key.
    await signIn("credentials", {
      username: user.username,
      password,
      remember: remember ? "1" : "0",
      redirect: false,
    });
  } catch {
    return authFormError(t("errors.invalidCredentials"));
  }
  // PHASE O — land the user where they were going, or on their role's home.
  redirect(loginDestination(user.role as Role, callbackUrl));
}


/**
 * Forgot / reset password — self-service foundation.
 *
 * The account is verified by username + the registered email, then a new
 * password is set. This works fully offline (dev + prod) without an email/SMS
 * provider. PRODUCTION HARDENING (documented in .env.example): gate this behind
 * an emailed/SMS one-time token (SMTP/SendGrid or an SMS gateway) so a reset
 * cannot be performed with knowledge of username+email alone.
 */
export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { t } = await getT();
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  // Same rules the client runs — each failure lands under its own field.
  const fieldErrors: FieldErrors = {};
  if (!username) fieldErrors.username = t("validation.required");
  if (!email) fieldErrors.email = t("validation.required");
  if (!password) fieldErrors.password = t("validation.required");
  else if (password.length < LIMITS.passwordMin) {
    fieldErrors.password = t("validation.passwordShort", { n: LIMITS.passwordMin });
  } else if (/^\d+$/.test(password)) {
    fieldErrors.password = t("validation.passwordNumeric");
  }
  if (!fieldErrors.password && password !== confirm) {
    fieldErrors.confirm_password = t("validation.passwordMatch");
  }
  if (Object.keys(fieldErrors).length > 0) return authFieldErrors(fieldErrors);

  const user = await prisma.user.findUnique({ where: { username } });
  // Verify identity without leaking which field was wrong — form-level on purpose.
  if (!user || user.email.toLowerCase() !== email || !user.isActive || user.status === "deleted") {
    return authFormError(t("auth.resetIdentityFailed"));
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  redirect("/login?reset=1");
}

/** Logout: clear the NextAuth session and return to /login. */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Registration — PUBLIC path is customer-only. Other role paths are rejected
 * (staff accounts are created by a Super Admin). On success customers are
 * auto-approved and logged straight in.
 */
export async function registerAction(
  rolePath: string,
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { t } = await getT();

  if (rolePath !== "customer") {
    return authFormError(t("errors.auth.staffCreatedBySuperAdminOnly"));
  }

  const body = new FormData();
  for (const [key, value] of formData.entries()) {
    if (value instanceof File && value.size === 0) continue;
    if (key.startsWith("$")) continue;
    body.append(key, value);
  }

  try {
    await sendForm("/auth/register/customer/", "POST", body);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // Duplicate username/email/phone come back keyed by field — show them there.
    const { fieldErrors, formError } = parseFieldErrors(err.data);
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      error: formError ?? (hasFields ? null : t("errors.generic")),
      fieldErrors,
      submissionId: Date.now(),
    };
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { username, password, redirect: false });
  } catch {
    redirect("/login");
  }
  // Registration signs the new account in, so it is a login and must land where
  // every other login lands — through the one helper, never its own rule. A
  // registration has no callbackUrl, so this resolves to ROLE_HOME.customer ("/").
  redirect(loginDestination("customer", ""));
}

/**
 * Delete My Account (customer). Soft-deletes: the account is deactivated and
 * personal data anonymized so it can never log in again and PII is removed,
 * while order/payment history stays referentially intact for accounting.
 * Then the session is cleared and the user is sent to /login.
 */
export async function deleteAccountAction(): Promise<AuthFormState> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!userId) {
    const { t } = await getT();
    return authFormError(t("errors.sessionExpired"));
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "customer") {
    const { t } = await getT();
    return authFormError(t("errors.permissionDenied"));
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      status: "deleted",
      username: `deleted_${userId}`,
      email: `deleted_${userId}@deleted.local`,
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      profilePhoto: null,
      notificationsEnabled: false,
    },
  });

  await signOut({ redirectTo: "/login" });
  return { error: null };
}
