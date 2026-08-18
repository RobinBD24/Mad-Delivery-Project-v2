import { ReservationDetailView } from "@/components/branch/reservation-detail";
import { requireRole } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export default async function Page({ params }: Params) {
  await requireRole("customer");
  const { id } = await params;
  return <ReservationDetailView id={id} backHref="/customer/reservations" canManage={false} />;
}
