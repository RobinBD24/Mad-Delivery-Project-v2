import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound, sk } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { parseBody } from "@/lib/http/form";
import { saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { deleteEmployee, employeeForManage, serializeEmployee, updateEmployee } from "@/lib/services/employees";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/employees/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await employeeForManage(me, Number(id)); // IDOR guard (own branch / SA any)
  const employee = await prisma.branchEmployee.findUnique({
    where: { id: Number(id) },
    include: { team: { select: { id: true, name: true } } },
  });
  if (!employee) throw notFound(sk("errors.ops.employeeNotFound"));
  return json(serializeEmployee(employee));
});

// PATCH /api/employees/[id] — update (multipart w/ optional photo).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const { fields, file, has } = await parseBody(req);
  const photo = file("photo");
  const employee = await updateEmployee(me, Number(id), {
    ...(has("first_name") ? { firstName: fields.first_name } : {}),
    ...(has("last_name") ? { lastName: fields.last_name } : {}),
    ...(has("employee_code") ? { employeeCode: fields.employee_code } : {}),
    ...(has("phone") ? { phone: fields.phone } : {}),
    ...(has("email") ? { email: fields.email } : {}),
    ...(has("joining_date") ? { joiningDate: fields.joining_date || null } : {}),
    ...(has("department") ? { department: fields.department } : {}),
    ...(has("role") ? { role: fields.role } : {}),
    ...(has("custom_role") ? { customRole: fields.custom_role } : {}),
    ...(has("team_id") ? { teamId: fields.team_id ? Number(fields.team_id) : null } : {}),
    ...(has("is_active") ? { isActive: fields.is_active === "true" } : {}),
    ...(has("notes") ? { notes: fields.notes } : {}),
    ...(photo ? { photo: await saveUpload(photo, "employee_photos", "photo") } : {}),
  });
  return json(serializeEmployee(employee));
});

// DELETE /api/employees/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await deleteEmployee(me, Number(id));
  return noContent();
});
