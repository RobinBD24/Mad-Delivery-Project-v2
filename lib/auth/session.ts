import "server-only";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/current-user";
import { ROLE_HOME } from "@/lib/constants";
import { serializeUser } from "@/lib/serializers";
import type { Role, User } from "@/types";

/** The logged-in user in the frontend (serialized) shape, or throws if absent. */
export async function getCurrentUser(): Promise<User> {
  const dbUser = await getSessionUser();
  if (!dbUser) throw new Error("Not authenticated");
  return serializeUser(dbUser) as User;
}

/**
 * Current user for PUBLIC pages (homepage) — returns null instead of throwing
 * when the visitor is logged out.
 */
export async function getOptionalUser(): Promise<User | null> {
  const dbUser = await getSessionUser();
  return dbUser ? (serializeUser(dbUser) as User) : null;
}

/** Require a logged-in user; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

/** Require one of the given roles; wrong role → own dashboard. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(ROLE_HOME[user.role] ?? "/login");
  }
  return user;
}
