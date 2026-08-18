import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { parseId } from "@/lib/http/params";
import { serializeCategory } from "@/lib/serializers";
import { setCategoryActive } from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/categories/[id]/status { is_active } — req #3.
// SUPER ADMIN ONLY (enforced in the service, not the UI). Repeating the current
// state returns 409 so a double-submit can't be mistaken for a real transition.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { is_active?: boolean };
  const updated = await setCategoryActive(
    me,
    parseId(id),
    Boolean(body.is_active),
  );
  return json(serializeCategory(updated));
});
