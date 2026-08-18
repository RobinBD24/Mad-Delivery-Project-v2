import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle, validationError } from "@/lib/http/errors";
import { getT } from "@/lib/i18n/server";
import {
  MANAGEMENT_REPORTS,
  buildReport,
  reportToCsv,
  type ManagementReportType,
} from "@/lib/services/management";

// GET /api/management/export?type=<report>&format=csv — CSV download.
// (PDF asks for PDF/Excel too; CSV opens in Excel and needs no external lib.
// Server-side XLSX/PDF is documented as an optional external dependency.)
export const GET = handle(async (req: Request) => {
  await requireApiRole("management", "super_admin");
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ManagementReportType;
  if (!MANAGEMENT_REPORTS.includes(type)) {
    throw validationError({ type: "Unknown report type." });
  }

  const { t } = await getT();
  const report = await buildReport(type);
  const labels = report.columns.map((c) => t(`mgmtReports.col.${c}`));
  const csv = reportToCsv(report, labels);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mad-${type}-report.csv"`,
    },
  });
});
