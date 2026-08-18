import type { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, sk, validationError } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { NOTICE_AUDIENCES } from "@/lib/constants/enums";
import type { NoticeAudience } from "@/lib/constants/enums";
import { serializeNotice } from "@/lib/serializers";
import { publishNotice } from "@/lib/services/notifications";
import { LIMITS } from "@/lib/validation/limits";
import { validateRequired } from "@/lib/validation/server";

// GET /api/notices — notices targeted at the caller (their role or "all").
// Super admin & marketing see every notice (they compose them).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const where: Prisma.NoticeWhereInput =
    me.role === "super_admin" || me.role === "marketing"
      ? {}
      : { audience: { in: ["all", me.role] } };

  const [count, items] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({ where, include: { author: true }, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(items.map(serializeNotice), { page, pageSize, count });
});

// POST /api/notices — compose + publish a broadcast. Super admin sends notices;
// marketing sends marketing broadcasts.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  if (me.role !== "super_admin" && me.role !== "marketing") throw forbidden();
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    audience?: string;
  };
  if (!body.title?.trim()) throw validationError({ title: sk("errors.ops.titleRequired") });
  const title = validateRequired(body.title, "title", { max: 150 });
  // Required on BOTH sides — a broadcast with no message body is never useful,
  // and the composer marks it required, so the server must agree.
  const message = validateRequired(body.body, "body", { max: LIMITS.longTextMax });
  const audience = (body.audience ?? "all") as NoticeAudience;
  if (!NOTICE_AUDIENCES.includes(audience)) {
    throw validationError({ audience: sk("errors.ops.recipientInvalid") });
  }

  const notice = await publishNotice({
    authorId: me.id,
    title,
    body: message,
    audience,
    type: me.role === "marketing" ? "marketing" : "notice",
  });
  const full = await prisma.notice.findUniqueOrThrow({
    where: { id: notice.id },
    include: { author: true },
  });
  return created(serializeNotice(full));
});
