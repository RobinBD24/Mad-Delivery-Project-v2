import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { evaluateSegment } from "@/lib/services/marketing";

// GET /api/marketing/segments — segments with live audience size.
export const GET = handle(async () => {
  await requireApiRole("marketing", "super_admin", "management");
  const segments = await prisma.audienceSegment.findMany({ orderBy: { createdAt: "desc" } });
  const withSize = await Promise.all(
    segments.map(async (s) => ({
      id: s.id,
      name: s.name,
      criteria: s.criteria,
      size: (await evaluateSegment(s.criteria)).length,
      created_at: s.createdAt.toISOString(),
    })),
  );
  return paginated(withSize);
});

// POST /api/marketing/segments  { name, location?, min_orders?, days_since_last_order? }
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("marketing", "super_admin");
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    location?: string;
    min_orders?: number;
    days_since_last_order?: number;
  };
  const name = String(body.name ?? "").trim();
  if (!name) throw validationError({ name: sk("errors.ops.segmentNameRequired") });

  const criteria = JSON.stringify({
    location: body.location?.trim() || undefined,
    min_orders: Number(body.min_orders) || undefined,
    days_since_last_order: Number(body.days_since_last_order) || undefined,
  });
  const segment = await prisma.audienceSegment.create({
    data: { name, criteria, createdById: me.id },
  });
  const size = (await evaluateSegment(segment.criteria)).length;
  return created({
    id: segment.id,
    name: segment.name,
    criteria: segment.criteria,
    size,
    created_at: segment.createdAt.toISOString(),
  });
});
