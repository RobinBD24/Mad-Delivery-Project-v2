import { redirect } from "next/navigation";

/** Customer registration now lives at /register — keep the old URL working. */
export default function CustomerRegisterRedirect() {
  redirect("/register");
}
