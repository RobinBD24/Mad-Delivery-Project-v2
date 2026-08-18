import { requireApiUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeUser } from "@/lib/serializers";

// GET /api/auth/me — the logged-in user.
export const GET = handle(async () => {
  const me = await requireApiUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    include: { approvedBy: true },
  });
  return json(serializeUser(user));
});
