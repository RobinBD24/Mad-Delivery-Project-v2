import { requireApiUser } from "@/lib/auth/current-user";
import { handle, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { changePassword } from "@/lib/services/users";
import { validatePassword } from "@/lib/validation/server";

// POST /api/auth/change-password  { old_password, new_password }
export const POST = handle(async (req: Request) => {
  const me = await requireApiUser();
  const body = (await req.json().catch(() => ({}))) as { old_password?: string; new_password?: string };
  const oldPassword = String(body.old_password ?? "");
  const newPassword = validatePassword(String(body.new_password ?? ""), "new_password");
  await changePassword(me.id, oldPassword, newPassword);
  return json({ detail: sk("errors.auth.passwordChanged") });
});
