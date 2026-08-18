import type { NextAuthConfig } from "next-auth";

import type { Role, UserStatus } from "@/types";

/**
 * Edge-safe Auth.js config (NO Prisma / bcrypt imports here).
 * Used by `middleware.ts` for lightweight route protection and shared by the
 * full Node config in `auth.ts`. The Credentials provider is attached there.
 */
/**
 * "Remember me" session lengths. The cookie/JWT itself is issued for
 * REMEMBER_MAX_AGE; when the user did NOT tick "remember me" the `jwt` callback
 * hard-expires the token after SHORT_MAX_AGE by returning null, which destroys
 * the session. This is real enforcement, not a decorative checkbox.
 */
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const SHORT_MAX_AGE = 24 * 60 * 60; // 1 day

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: REMEMBER_MAX_AGE },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    // Persist identity + role/status into the JWT so middleware and route
    // handlers can authorize without a DB round-trip.
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
        token.status = (user as { status: UserStatus }).status;
        token.username = (user as { username: string }).username;
        token.name = user.name ?? null;
        token.picture = (user as { image?: string | null }).image ?? null;
        token.remember = (user as { remember?: boolean }).remember ?? false;
        token.loginAt = Date.now();
      }

      // Not "remembered" → end the session once the short window elapses.
      // Returning null from this callback destroys the session.
      if (!token.remember && typeof token.loginAt === "number") {
        if (Date.now() - token.loginAt > SHORT_MAX_AGE * 1000) return null;
      }
      // Allow session.update({...}) to refresh cached name/photo after a profile edit.
      if (trigger === "update" && session) {
        const s = session as { name?: string; image?: string | null };
        if (s.name !== undefined) token.name = s.name;
        if (s.image !== undefined) token.picture = s.image;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = token.role as Role;
        session.user.status = token.status as UserStatus;
        session.user.username = (token.username as string) ?? "";
        session.user.name = (token.name as string) ?? null;
        session.user.image = (token.picture as string) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
