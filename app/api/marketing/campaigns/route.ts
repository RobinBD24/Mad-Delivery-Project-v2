import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { parseCampaignBody, serializeCampaign } from "@/lib/services/marketing";

// GET /api/marketing/campaigns
export const GET = handle(async () => {
  await requireApiRole("marketing", "super_admin", "management");
  const items = await prisma.campaign.findMany({
    include: { coupon: true },
    orderBy: { createdAt: "desc" },
  });
  return paginated(items.map(serializeCampaign));
});

// POST /api/marketing/campaigns
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("marketing", "super_admin");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = parseCampaignBody(body);
  const campaign = await prisma.campaign.create({
    data: { ...data, createdById: me.id },
    include: { coupon: true },
  });
  return created(serializeCampaign(campaign));
});
