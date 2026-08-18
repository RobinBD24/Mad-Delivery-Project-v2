import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { generateSettlement } from "@/lib/services/financials";

function serialize(s: {
  id: number;
  branchId: number;
  date: Date;
  orders: number;
  sales: { toFixed(n: number): string };
  commission: { toFixed(n: number): string };
  expenses: { toFixed(n: number): string };
  net: { toFixed(n: number): string };
  createdAt: Date;
  branch?: { name: string } | null;
  generatedBy?: { firstName: string; lastName: string; username: string } | null;
}) {
  return {
    id: s.id,
    branch: s.branchId,
    branch_name: s.branch?.name ?? "",
    date: s.date.toISOString().slice(0, 10),
    orders: s.orders,
    sales: s.sales.toFixed(2),
    commission: s.commission.toFixed(2),
    expenses: s.expenses.toFixed(2),
    net: s.net.toFixed(2),
    generated_by_name: s.generatedBy
      ? `${s.generatedBy.firstName} ${s.generatedBy.lastName}`.trim() || s.generatedBy.username
      : null,
    created_at: s.createdAt.toISOString(),
  };
}

// GET /api/accounts/settlements
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, items] = await Promise.all([
    prisma.branchSettlement.count(),
    prisma.branchSettlement.findMany({
      include: { branch: true, generatedBy: true },
      orderBy: { date: "desc" },
      skip,
      take,
    }),
  ]);
  return paginated(items.map(serialize), { page, pageSize, count });
});

// POST /api/accounts/settlements  { branch_id, date } — generate end-of-day snapshot.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("accounts", "super_admin");
  const body = (await req.json().catch(() => ({}))) as { branch_id?: number; date?: string };
  const settlement = await generateSettlement(me, Number(body.branch_id), String(body.date ?? ""));
  return created(serialize(settlement));
});
