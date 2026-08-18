import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/notices/[id] — super admin removes a notice.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  await prisma.notice.delete({ where: { id: Number(id) } });
  return noContent();
});
