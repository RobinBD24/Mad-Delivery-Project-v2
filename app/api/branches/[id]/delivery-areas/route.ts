import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeArea } from "@/lib/services/delivery-areas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/branches/[id]/delivery-areas — customer-facing list of a branch's
// ACTIVE named delivery areas for the checkout area selector (req #1/#6). Held
// areas are still returned (with is_held/hold_reason) so the UI can show them
// disabled with a reason; inactive areas are omitted entirely. The server
// remains the authority — selecting a held area is rejected at order time.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireApproved();
  const { id } = await ctx.params;
  const areas = await prisma.branchDeliveryArea.findMany({
    where: { branchId: Number(id), isActive: true },
    include: { branch: { select: { name: true } } },
    orderBy: [{ isHeld: "asc" }, { name: "asc" }],
  });
  return json({ results: areas.map(serializeArea) });
});
