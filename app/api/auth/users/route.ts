import { requireApiRole } from "@/lib/auth/current-user";
import { ROLES, USER_STATUSES } from "@/lib/constants/enums";
import { prisma } from "@/lib/db";
import { handle, sk, validationError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { saveUpload } from "@/lib/http/upload";
import { adminUserListWhere } from "@/lib/selectors";
import { serializeUser } from "@/lib/serializers";
import { assertPhoneAvailable, createUserByAdmin } from "@/lib/services/users";
import { validatePassword, validatePhone } from "@/lib/validation/server";
import type { Role } from "@/types";

const RIDER_FIELD_MAP: Record<string, string> = {
  nid_number: "nidNumber",
  driving_license_number: "drivingLicenseNumber",
  bike_registration_number: "bikeRegistrationNumber",
  vehicle_type: "vehicleType",
  blood_group: "bloodGroup",
  emergency_contact_name: "emergencyContactName",
  emergency_contact_phone: "emergencyContactPhone",
};

// GET /api/auth/users — Super Admin user list (?role=&status=&is_active=&search=).
// `status` accepts pending|approved|rejected|active|inactive|blocked; invalid
// values for any param are ignored (see adminUserListWhere).
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin");
  const url = new URL(req.url);
  const { skip, take, pageSize, page } = pageParams(url);

  const where = adminUserListWhere({
    excludeUserId: me.id,
    role: url.searchParams.get("role"),
    status: url.searchParams.get("status"),
    isActive: url.searchParams.get("is_active"),
    search: url.searchParams.get("search"),
  });

  const [count, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { approvedBy: true }, orderBy: { dateJoined: "desc" }, skip, take }),
  ]);
  return paginated(users.map(serializeUser), { page, pageSize, count });
});

// POST /api/auth/users — Super Admin creates any role.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin");
  const { fields, file } = await parseBody(req);

  const username = (fields.username ?? "").trim();
  const email = (fields.email ?? "").trim();
  const firstName = (fields.first_name ?? "").trim();
  const lastName = (fields.last_name ?? "").trim();
  const role = (fields.role ?? "") as Role;
  const status = fields.status || "approved";
  const password = fields.password ?? "";

  const errs: Record<string, string> = {};
  if (!ROLES.includes(role)) errs.role = sk("errors.auth.invalidRole");
  if (!USER_STATUSES.includes(status as never)) errs.status = sk("errors.auth.invalidStatus");
  if (!username) errs.username = sk("errors.auth.usernameRequired");
  if (!email) errs.email = sk("errors.auth.emailRequired");
  if (!firstName) errs.first_name = sk("errors.auth.firstNameRequired");
  if (!lastName) errs.last_name = sk("errors.auth.lastNameRequired");
  if (Object.keys(errs).length) throw validationError(errs);

  validatePassword(password);
  if (fields.phone) {
    validatePhone(fields.phone);
    await assertPhoneAvailable(fields.phone);
  }

  if (await prisma.user.findFirst({ where: { username: { equals: username } } })) {
    throw validationError({ username: sk("errors.auth.usernameTaken") });
  }
  if (await prisma.user.findFirst({ where: { email: { equals: email } } })) {
    throw validationError({ email: sk("errors.auth.emailTaken") });
  }

  let profilePhoto: string | null = null;
  const photo = file("profile_photo");
  if (photo) profilePhoto = await saveUpload(photo, "profile_photos", "profile_photo");

  const riderFields: Record<string, string> = {};
  if (role === "rider") {
    for (const [snake, camel] of Object.entries(RIDER_FIELD_MAP)) {
      if (fields[snake]) riderFields[camel] = fields[snake];
    }
  }

  const user = await createUserByAdmin({
    createdById: me.id,
    username,
    email,
    firstName,
    lastName,
    role,
    status,
    password,
    phone: fields.phone ?? "",
    address: fields.address ?? "",
    dateOfBirth: fields.date_of_birth ? new Date(fields.date_of_birth) : null,
    gender: fields.gender ?? "",
    profilePhoto,
    riderFields,
  });

  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { approvedBy: true } });
  return created(serializeUser(full));
});
