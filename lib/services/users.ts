import "server-only";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

import { ROLE_DASHBOARD } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { sk, validationError } from "@/lib/http/errors";
import { notifyUser } from "@/lib/services/notifications";
import { ensureRegistrationAddress } from "@/lib/services/addresses";
import type { Role } from "@/types";

const ROUNDS = 10;

/**
 * A mobile number identifies an account at login, so it must be unique.
 * `User.phone` defaults to "" (many accounts legitimately have none), which
 * rules out a DB-level unique constraint, so uniqueness is enforced here and
 * called from every path that writes a user's phone.
 */
export async function assertPhoneAvailable(phone: string, exceptUserId?: number): Promise<void> {
  if (!phone) return; // blank = "no phone on file"; never treated as a duplicate
  const clash = await prisma.user.findFirst({
    where: { phone, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  if (clash) throw validationError({ phone: sk("errors.auth.phoneTaken") });
}

/*
 * NOTE — account notifications ("your account was created/approved") deep-link
 * to the recipient's ACCOUNT AREA, so they use the shared ROLE_DASHBOARD map,
 * deliberately NOT ROLE_HOME: ROLE_HOME is the post-login landing page, which
 * for a customer is now the public homepage. This file used to keep a private
 * copy of the role→path map; it is gone so the two can never drift apart.
 */

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export interface CreateUserInput {
  createdById: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  password: string;
  phone?: string;
  address?: string;
  dateOfBirth?: Date | null;
  gender?: string;
  profilePhoto?: string | null;
  riderFields?: Record<string, string>;
}

/** Super Admin creates any user (staff or customer). Ported from accounts.services. */
export async function createUserByAdmin(input: CreateUserInput): Promise<User> {
  const approved = input.status === "approved";
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        status: input.status,
        password: await hashPassword(input.password),
        phone: input.phone ?? "",
        address: input.address ?? "",
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? "",
        profilePhoto: input.profilePhoto ?? null,
        isStaff: input.role === "super_admin",
        isSuperuser: input.role === "super_admin",
        ...(approved ? { approvedById: input.createdById, approvedAt: new Date() } : {}),
      },
    });
    if (input.role === "rider") {
      await tx.riderProfile.create({
        data: { userId: user.id, ...(input.riderFields ?? {}) },
      });
    }
    return user;
  }).then(async (user) => {
    // Welcome the new account. Approved staff can sign in now; pending staff
    // are told they await approval.
    await notifyUser(user.id, {
      type: "account",
      titleKey: "notifications.account.created.title",
      bodyKey: approved
        ? "notifications.account.created.body"
        : "notifications.account.createdPending.body",
      link: approved ? (ROLE_DASHBOARD[user.role as Role] ?? "/") : null,
    });
    return user;
  });
}

/** Public registration — CUSTOMER only, auto-approved. */
export async function registerCustomer(input: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address?: string;
  password: string;
}): Promise<User> {
  const password = await hashPassword(input.password);
  // req #17 — save the registration address as the customer's default address,
  // transactionally with the account. Idempotent (see ensureRegistrationAddress).
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        address: input.address ?? "",
        password,
        role: "customer",
        status: "approved",
      },
    });
    await ensureRegistrationAddress(tx, user.id, input.address ?? "");
    return user;
  });
}

export function setUserActive(userId: number, active: boolean): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { isActive: active } });
}

export async function approveUser(userId: number, approvedById: number): Promise<User> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: "approved", approvedById, approvedAt: new Date(), rejectionReason: "" },
  });
  await notifyUser(userId, {
    type: "account",
    titleKey: "notifications.account.approved.title",
    bodyKey: "notifications.account.approved.body",
    link: ROLE_DASHBOARD[user.role as Role] ?? "/",
  });
  return user;
}

export async function rejectUser(userId: number, rejectedById: number, reason: string): Promise<User> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "rejected",
      approvedById: rejectedById,
      approvedAt: null,
      // Empty when unspecified so the display layer shows a localized fallback
      // (errors.auth.notSpecified) instead of a hardcoded Bangla string.
      rejectionReason: reason || "",
    },
  });
  await notifyUser(userId, {
    type: "account",
    titleKey: "notifications.account.rejected.title",
    // Key-based label + the admin's raw reason as the body (user-written content).
    body: reason?.trim() || "",
    bodyKey: reason?.trim() ? undefined : "notifications.account.rejected.body",
  });
  return user;
}

/** Update own password after verifying the current one. */
export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ok = await bcrypt.compare(oldPassword, user.password);
  if (!ok) {
    const { sk, validationError } = await import("@/lib/http/errors");
    throw validationError({ old_password: sk("errors.money.currentPasswordIncorrect") });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(newPassword) },
  });
}
