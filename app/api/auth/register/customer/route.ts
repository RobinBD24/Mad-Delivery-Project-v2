import { prisma } from "@/lib/db";
import { handle, sk, validationError } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";
import { assertPhoneAvailable, registerCustomer } from "@/lib/services/users";
import { validatePassword, validatePhone } from "@/lib/validation/server";

/** Read a field from either multipart form-data or a JSON body. */
async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v == null ? "" : String(v)]));
  }
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

// POST /api/auth/register/customer — PUBLIC. Creates an auto-approved customer.
export const POST = handle(async (req: Request) => {
  const b = await readBody(req);

  if (b.role && b.role !== "customer") {
    throw validationError({ role: sk("errors.auth.publicRegisterCustomerOnly") });
  }

  const username = (b.username ?? "").trim();
  const email = (b.email ?? "").trim();
  const firstName = (b.first_name ?? "").trim();
  const lastName = (b.last_name ?? "").trim();
  const phone = (b.phone ?? "").trim();
  const password = b.password ?? "";
  const passwordConfirm = b.password_confirm ?? "";

  const fieldErrors: Record<string, string> = {};
  if (!username) fieldErrors.username = sk("errors.auth.usernameRequired");
  if (!email) fieldErrors.email = sk("errors.auth.emailRequired");
  if (!firstName) fieldErrors.first_name = sk("errors.auth.firstNameRequired");
  if (!lastName) fieldErrors.last_name = sk("errors.auth.lastNameRequired");
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);

  validatePhone(phone);
  await assertPhoneAvailable(phone); // mobile number is a login identifier → must be unique
  validatePassword(password);
  if (password !== passwordConfirm) throw validationError({ password_confirm: sk("errors.auth.passwordsMismatch") });

  if (await prisma.user.findFirst({ where: { username: { equals: username } } })) {
    throw validationError({ username: sk("errors.auth.usernameTaken") });
  }
  if (await prisma.user.findFirst({ where: { email: { equals: email } } })) {
    throw validationError({ email: sk("errors.auth.emailTaken") });
  }

  const user = await registerCustomer({
    username,
    email,
    firstName,
    lastName,
    phone,
    address: b.address ?? "",
    password,
  });
  return created(serializeUser(user));
});
