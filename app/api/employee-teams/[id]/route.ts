import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { deleteTeam, serializeTeam, teamForManage, updateTeam } from "@/lib/services/employee-teams";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  return json(serializeTeam(await teamForManage(me, Number(id))));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const team = await updateTeam(me, Number(id), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.description !== undefined ? { description: String(body.description) } : {}),
    ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
  });
  return json(serializeTeam(team));
});

/** DELETE — an empty team is removed; one with members is archived instead. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const result = await deleteTeam(me, Number(id));
  return json({ archived: result.archived, members: result.members, team: serializeTeam(result.team) });
});
