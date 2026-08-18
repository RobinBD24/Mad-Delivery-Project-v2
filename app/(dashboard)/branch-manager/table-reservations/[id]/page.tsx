import { ReservationDetailView } from "@/components/branch/reservation-detail";
import { requireRole } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export default async function Page({ params }: Params) {
  await requireRole("branch_manager");
  const { id } = await params;
  return <ReservationDetailView id={id} backHref="/branch-manager/table-reservations" canManage />;
}
