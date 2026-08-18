import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeEmployee, setEmploymentStatus } from "@/lib/services/employees";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/employees/[id]/status  { employment_status, reason } — PHASE M.
 *
 * Quit Job is a STATUS CHANGE, never a delete: the employee, their attendance
 * and every report survive it. Quitting requires a reason; repeating the current
 * status is a 409 so a double-submit cannot look like a real transition.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { employment_status?: string; reason?: string };
  const employee = await setEmploymentStatus(
    me,
    Number(id),
    String(body.employment_status ?? ""),
    String(body.reason ?? ""),
  );
  return json(serializeEmployee(employee));
});
