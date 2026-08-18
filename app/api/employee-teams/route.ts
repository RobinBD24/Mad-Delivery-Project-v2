import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, json } from "@/lib/http/respond";
import { createTeam, listTeams, serializeTeam } from "@/lib/services/employee-teams";

// PHASE M — branch staff teams. A branch manager sees and writes only their own
// branch; the super admin may pass ?branch_id / branch_id. Management is
// read-only, which the shared branch guard already enforces on writes.

/** GET /api/employee-teams?branch_id=&include_archived=true */
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  const teams = await listTeams(me, {
    branchId: branchId ? Number(branchId) : undefined,
    includeArchived: url.searchParams.get("include_archived") === "true",
  });
  return json({ count: teams.length, results: teams.map(serializeTeam) });
});

/** POST /api/employee-teams */
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const team = await createTeam(me, {
    branchId: body.branch_id ? Number(body.branch_id) : undefined,
    name: String(body.name ?? ""),
    description: body.description === undefined ? undefined : String(body.description),
    isActive: body.is_active === undefined ? undefined : Boolean(body.is_active),
  });
  return created(serializeTeam(team));
});
