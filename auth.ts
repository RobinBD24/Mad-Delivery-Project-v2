import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import type { Role, UserStatus } from "@/types";

/**
 * Full Node-runtime Auth.js instance (Prisma + bcrypt). The Credentials
 * `authorize` only *succeeds* for an active, approved user with a valid
 * password; every other case returns null. The login server action performs a
 * richer pre-check to surface pending/rejected reasons (see lib/auth/actions).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {}, remember: {} },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        const remember = String(credentials?.remember ?? "") === "1";
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user || !user.isActive) return null;
        if (user.status !== "approved") return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Record login history (PDF: login history recorded for every role).
        await prisma.loginHistory.create({ data: { userId: user.id } }).catch(() => {});

        const fullName = `${user.firstName} ${user.lastName}`.trim();
        return {
          id: String(user.id),
          username: user.username,
          email: user.email,
          name: fullName || user.username,
          image: user.profilePhoto ?? null,
          role: user.role as Role,
          status: user.status as UserStatus,
          remember,
        };
      },
    }),
  ],
});
