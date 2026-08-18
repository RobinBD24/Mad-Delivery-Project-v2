import { requireApiRole } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";
import { setUserActive } from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/[id]/activate
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  await setUserActive(Number(id), true);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: Number(id) }, include: { approvedBy: true } });
  return json(serializeUser(user));
});
