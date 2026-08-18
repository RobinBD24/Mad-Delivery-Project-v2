import "server-only";
import { cache } from "react";
import type { User } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { forbidden, sk, unauthorized } from "@/lib/http/errors";
import type { Role } from "@/types";

/** The full DB user for the current session, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user || !user.isActive) return null;
  return user;
});

/** Require an authenticated user (throws 401). */
export async function requireApiUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** Require an authenticated + approved user (throws 401/403). */
export async function requireApproved(): Promise<User> {
  const user = await requireApiUser();
  if (user.status !== "approved") {
    throw forbidden(sk("errors.auth.accountNotApproved"));
  }
  return user;
}

/** Require an approved user with one of the given roles (super_admin always allowed for reads elsewhere). */
export async function requireApiRole(...roles: Role[]): Promise<User> {
  const user = await requireApproved();
  if (!roles.includes(user.role as Role)) {
    throw forbidden();
  }
  return user;
}
