import { requireApproved, requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";
import { bookRamadanTable } from "@/lib/services/branch-ops";

function serialize(b: {
  id: number;
  guestName: string;
  guestPhone: string;
  partySize: number;
  bookingDate: Date;
  status: string;
  table?: { name: string } | null;
  branch?: { name: string } | null;
  customer?: { firstName: string; lastName: string; username: string } | null;
}) {
  return {
    id: b.id,
    guest_name: b.guestName,
    guest_phone: b.guestPhone,
    party_size: b.partySize,
    booking_date: b.bookingDate.toISOString().slice(0, 10),
    status: b.status,
    table_name: b.table?.name ?? "",
    branch_name: b.branch?.name ?? "",
    customer_name: b.customer ? `${b.customer.firstName} ${b.customer.lastName}`.trim() || b.customer.username : "",
  };
}

// GET /api/ramadan/bookings — BM sees branch bookings; customer sees own.
export const GET = handle(async () => {
  const me = await requireApproved();
  let where = {};
  if (me.role === "branch_manager") {
    const branch = await branchForManager(me.id);
    where = { branchId: branch?.id ?? -1 };
  } else if (me.role === "customer") {
    where = { customerId: me.id };
  }
  const bookings = await prisma.ramadanBooking.findMany({
    where,
    include: { table: true, branch: true, customer: true },
    orderBy: { bookingDate: "desc" },
  });
  return paginated(bookings.map(serialize));
});

// POST /api/ramadan/bookings — customer books a table for an iftar date.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as {
    table_id?: number;
    guest_name?: string;
    guest_phone?: string;
    party_size?: number;
    booking_date?: string;
  };
  const booking = await bookRamadanTable(me, {
    tableId: Number(body.table_id),
    guestName: String(body.guest_name ?? ""),
    guestPhone: String(body.guest_phone ?? ""),
    partySize: Number(body.party_size ?? 2),
    bookingDate: String(body.booking_date ?? ""),
  });
  const full = await prisma.ramadanBooking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { table: true, branch: true, customer: true },
  });
  return created(serialize(full));
});
