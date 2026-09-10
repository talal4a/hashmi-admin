import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { effectivePermissions } from "@/lib/auth/permissions";
import { getDashboardData } from "@/server/services/analytics";
import { listAudit } from "@/server/repositories/audit";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const admin = await requirePermission("dashboard.view");
  const [data, activity] = await Promise.all([
    getDashboardData(7),
    admin.role === "analyst" ? Promise.resolve([]) : listAudit({ limit: 12 }),
  ]);

  return (
    <DashboardView
      data={data}
      activity={activity}
      permissions={effectivePermissions(admin)}
      adminName={admin.displayName}
    />
  );
}
