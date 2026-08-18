import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { parseCampaignBody, serializeCampaign } from "@/lib/services/marketing";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/marketing/campaigns/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: Number(id) },
    include: { coupon: true },
  });
  if (!campaign) throw notFound();
  return json(serializeCampaign(campaign));
});

// PATCH /api/marketing/campaigns/[id]
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const existing = await prisma.campaign.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const merged = {
    title: existing.title,
    description: existing.description,
    type: existing.type,
    starts_at: existing.startsAt.toISOString(),
    ends_at: existing.endsAt.toISOString(),
    is_active: existing.isActive,
    coupon_id: existing.couponId,
    ...body,
  };
  const data = parseCampaignBody(merged);
  const campaign = await prisma.campaign.update({
    where: { id: existing.id },
    data,
    include: { coupon: true },
  });
  return json(serializeCampaign(campaign));
});

// DELETE /api/marketing/campaigns/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const existing = await prisma.campaign.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound();
  await prisma.campaign.delete({ where: { id: existing.id } });
  return noContent();
});
