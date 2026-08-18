import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeRiderProfile } from "@/lib/serializers";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/rider-profiles/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role === "customer") throw forbidden();
  const { id } = await ctx.params;
  const profile = await prisma.riderProfile.findUnique({
    where: { id: Number(id) },
    include: { user: true, assignedBranch: true },
  });
  if (!profile) throw notFound(sk("errors.money.riderProfileNotFound"));
  // Riders may only read their own profile.
  if (me.role === "rider" && profile.userId !== me.id) throw forbidden();
  return json(serializeRiderProfile(profile));
});
