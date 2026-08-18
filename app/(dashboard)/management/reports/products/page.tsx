import { ManagementReportView } from "@/components/management/report-view";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("management", "super_admin");
  return <ManagementReportView type="products" />;
}
