import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeUser } from "@/lib/serializers";
import { createNotification } from "@/lib/services/notifications";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/[id]/unblock — super admin lifts a customer block.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user) throw notFound();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isBlocked: false, blockedReason: "" },
    include: { approvedBy: true },
  });
  await createNotification(user.id, {
    type: "account",
    titleKey: "notifications.account.unblocked.title",
    bodyKey: "notifications.account.unblocked.body",
    link: "/customer/dashboard",
  });
  return json(serializeUser(updated));
});
