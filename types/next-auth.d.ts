import type { DefaultSession } from "next-auth";

import type { Role, UserStatus } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      status: UserStatus;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    status: UserStatus;
    username: string;
    /** Set by the Credentials provider when "remember me" was ticked. */
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    status?: UserStatus;
    username?: string;
    /** "Remember me" — controls how long the session survives. */
    remember?: boolean;
    /** Epoch ms of sign-in, used to expire non-remembered sessions. */
    loginAt?: number;
  }
}
