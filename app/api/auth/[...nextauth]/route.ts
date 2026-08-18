// NextAuth (Auth.js) route handlers — powers /api/auth/signin, /signout,
// /session, /csrf, and the credentials callback used by the login form.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
