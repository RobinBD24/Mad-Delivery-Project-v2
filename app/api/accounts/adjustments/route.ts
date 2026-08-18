import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { recordAdjustment } from "@/lib/services/financials";

function serialize(a: {
  id: number;
  type: string;
  amount: { toFixed(n: number): string };
  note: string;
  branchId: number | null;
  createdAt: Date;
  branch?: { name: string } | null;
  createdBy?: { firstName: string; lastName: string; username: string } | null;
}) {
  return {
    id: a.id,
    type: a.type,
    amount: a.amount.toFixed(2),
    note: a.note,
    branch: a.branchId,
    branch_name: a.branch?.name ?? null,
    created_by_name: a.createdBy
      ? `${a.createdBy.firstName} ${a.createdBy.lastName}`.trim() || a.createdBy.username
      : null,
    created_at: a.createdAt.toISOString(),
  };
}

// GET /api/accounts/adjustments
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, items] = await Promise.all([
    prisma.financialAdjustment.count(),
    prisma.financialAdjustment.findMany({
      include: { branch: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(items.map(serialize), { page, pageSize, count });
});

// POST /api/accounts/adjustments  { type, amount, note, branch_id? }
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("accounts", "super_admin");
  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    amount?: string | number;
    note?: string;
    branch_id?: number | null;
  };
  const adjustment = await recordAdjustment(me, {
    type: String(body.type ?? ""),
    amount: String(body.amount ?? ""),
    note: String(body.note ?? ""),
    branchId: body.branch_id ? Number(body.branch_id) : null,
  });
  return created(serialize(adjustment));
});
