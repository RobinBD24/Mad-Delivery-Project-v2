import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { reservationsWhereForUser, serializeReservation } from "@/lib/services/branch-ops";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/reservations/[id] — detail with chat messages.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const reservation = await prisma.tableReservation.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      branch: true,
      messages: { include: { sender: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!reservation) throw notFound();

  const scope = await reservationsWhereForUser(me);
  const allowed =
    me.role === "customer" ? reservation.customerId === me.id : scope !== null;
  if (!allowed) throw forbidden();
  if (me.role === "branch_manager" && scope && "branchId" in scope && scope.branchId !== reservation.branchId) {
    throw forbidden();
  }
  return json(serializeReservation(reservation));
});
