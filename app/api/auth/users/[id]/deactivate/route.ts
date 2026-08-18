import { requireApiRole } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { forbidden, handle, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";
import { setUserActive } from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/[id]/deactivate — cannot deactivate own account.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiRole("super_admin");
  const { id } = await ctx.params;
  if (Number(id) === me.id) throw forbidden(sk("errors.auth.cannotDeactivateSelf"));
  await setUserActive(Number(id), false);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: Number(id) }, include: { approvedBy: true } });
  return json(serializeUser(user));
});
