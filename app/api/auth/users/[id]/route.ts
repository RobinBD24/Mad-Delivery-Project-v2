import type { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { ROLES } from "@/lib/constants/enums";
import { prisma } from "@/lib/db";
import { forbidden, handle, notFound, sk, validationError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { json, noContent } from "@/lib/http/respond";
import { deleteUpload, saveUpload } from "@/lib/http/upload";
import { serializeUser } from "@/lib/serializers";
import { assertPhoneAvailable, hashPassword } from "@/lib/services/users";
import { validatePhone } from "@/lib/validation/server";

type Ctx = { params: Promise<{ id: string }> };

async function getTarget(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound(sk("errors.auth.userNotFound"));
  return user;
}

// GET /api/auth/users/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id: Number(id) }, include: { approvedBy: true } });
  if (!user) throw notFound(sk("errors.auth.userNotFound"));
  return json(serializeUser(user));
});

// PATCH /api/auth/users/[id]
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const target = await getTarget(Number(id));
  const { fields, file, has } = await parseBody(req);

  const data: Prisma.UserUpdateInput = {};
  if (has("first_name")) data.firstName = fields.first_name;
  if (has("last_name")) data.lastName = fields.last_name;
  if (has("address")) data.address = fields.address;
  if (has("gender")) data.gender = fields.gender;
  if (fields.role) {
    if (!ROLES.includes(fields.role as never)) throw validationError({ role: sk("errors.auth.invalidRole") });
    data.role = fields.role;
  }
  if (fields.email && fields.email !== target.email) {
    const exists = await prisma.user.findFirst({ where: { email: fields.email, id: { not: target.id } } });
    if (exists) throw validationError({ email: sk("errors.auth.emailTaken") });
    data.email = fields.email;
  }
  if (has("phone")) {
    if (fields.phone) {
      await assertPhoneAvailable(fields.phone, target.id);
      data.phone = validatePhone(fields.phone);
    } else {
      data.phone = "";
    }
  }
  if (has("date_of_birth")) {
    data.dateOfBirth = fields.date_of_birth ? new Date(fields.date_of_birth) : null;
  }
  if (fields.password) data.password = await hashPassword(fields.password);

  const photo = file("profile_photo");
  if (photo) data.profilePhoto = await saveUpload(photo, "profile_photos", "profile_photo");

  await prisma.user.update({ where: { id: target.id }, data });
  if (typeof data.profilePhoto === "string" && target.profilePhoto && target.profilePhoto !== data.profilePhoto) {
    await deleteUpload(target.profilePhoto);
  }
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: target.id }, include: { approvedBy: true } });
  return json(serializeUser(fresh));
});

// DELETE /api/auth/users/[id] — cannot delete a super admin.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const target = await getTarget(Number(id));
  if (target.role === "super_admin") throw forbidden(sk("errors.auth.cannotDeleteSuperAdmin"));

  // A customer's orders reference them (FK restrict), so remove those orders
  // (and their items) first. Every other relation cascades / nulls on its own.
  await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { customerId: target.id }, select: { id: true } });
    if (orders.length) {
      const orderIds = orders.map((o) => o.id);
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await tx.user.delete({ where: { id: target.id } });
  });
  return noContent();
});
