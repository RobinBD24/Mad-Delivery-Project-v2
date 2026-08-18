import type { Metadata } from "next";

import { ComplaintsView } from "@/components/complaints/complaints-view";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("complaints.title") };
}

type Params = { searchParams: Promise<{ status?: string; box?: string }> };

export default async function Page({ searchParams }: Params) {
  await requireRole("marketing");
  const sp = await searchParams;
  return <ComplaintsView role="marketing" basePath="/marketing/complaints" searchParams={sp} />;
}
