import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/marketing/segments/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const existing = await prisma.audienceSegment.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound();
  await prisma.audienceSegment.delete({ where: { id: existing.id } });
  return noContent();
});
