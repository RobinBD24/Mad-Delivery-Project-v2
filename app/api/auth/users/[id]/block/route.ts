import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeUser } from "@/lib/serializers";
import { createNotification } from "@/lib/services/notifications";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/[id]/block  { reason } — super admin blocks a fake-order customer.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  await requireApiRole("super_admin");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(body.reason ?? "").trim();
  if (!reason) throw validationError({ reason: sk("errors.auth.blockReasonRequired") });

  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user) throw notFound();
  if (user.role !== "customer") throw validationError({ user: sk("errors.auth.onlyCustomerBlockable") });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isBlocked: true, blockedReason: reason },
    include: { approvedBy: true },
  });
  await createNotification(user.id, {
    type: "system",
    titleKey: "notifications.account.blocked.title",
    body: reason, // admin-written reason — kept as typed
    link: "/customer/support",
  });
  return json(serializeUser(updated));
});
