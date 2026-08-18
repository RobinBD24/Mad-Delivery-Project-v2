import { ComplaintDetailView } from "@/components/complaints/complaint-detail-view";

type Params = { params: Promise<{ id: string }> };

/** Canonical complaint detail, reachable by every role via /complaints/[id]. */
export default async function ComplaintPage({ params }: Params) {
  const { id } = await params;
  return <ComplaintDetailView id={id} />;
}
