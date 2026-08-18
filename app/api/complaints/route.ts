import type { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeComplaint } from "@/lib/serializers";
import { COMPLAINT_INCLUDE, complaintsWhereForUser, createComplaint } from "@/lib/services/complaints";

// GET /api/complaints — role-scoped list (?status=&box=inbox|sent).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const scope = await complaintsWhereForUser(me);
  const where: Prisma.ComplaintWhereInput = { ...scope };
  const status = url.searchParams.get("status");
  const box = url.searchParams.get("box");
  if (status) where.status = status;
  // "sent" = complaints I filed; "inbox" = complaints addressed to my role.
  if (box === "sent") where.complainantId = me.id;
  if (box === "inbox") {
    if (me.role === "super_admin") {
      where.recipientRole = "super_admin";
    } else {
      where.complainantId = { not: me.id };
    }
  }

  const [count, items] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({ where, include: COMPLAINT_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(items.map(serializeComplaint), { page, pageSize, count });
});

// POST /api/complaints — any approved user may file a complaint.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    recipient_role?: string;
    branch_id?: number | null;
    order_id?: number | null;
    category?: string;
    subject?: string;
    message?: string;
  };

  const complaint = await createComplaint({
    complainantId: me.id,
    recipientRole: String(body.recipient_role ?? ""),
    branchId: body.branch_id ?? null,
    orderId: body.order_id ?? null,
    category: String(body.category ?? "other"),
    subject: String(body.subject ?? ""),
    message: String(body.message ?? ""),
  });
  return created(serializeComplaint(complaint));
});
