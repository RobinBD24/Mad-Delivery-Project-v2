import { redirect } from "next/navigation";

/** Public staff registration is disabled — staff accounts are created by a
 *  super admin from the dashboard. Only customer registration is public. */
export default function StaffRegisterDisabled() {
  redirect("/register");
}
