import { requireApiRole } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";
import { rejectUser } from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/[id]/reject  { reason? }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  await rejectUser(Number(id), me.id, String(body.reason ?? ""));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: Number(id) }, include: { approvedBy: true } });
  return json(serializeUser(user));
});
